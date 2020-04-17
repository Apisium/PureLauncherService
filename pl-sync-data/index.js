const fetch = require('node-fetch').default
const urlJoin = require('url-join')
const cheerio = require('cheerio')
const COS = require('cos-nodejs-sdk-v5')
const Refresher = require('tencent-cdn-refresh/src/refresh')
const { promisify } = require('util')

const options = {
  SecretId: process.env.SECRET_ID,
  SecretKey: process.env.SECRET_KEY
}
const cos = new COS(options)
const refresher = new Refresher(options)
const getObject = promisify(cos.getObject.bind(cos))
const putObject = promisify(cos.putObject.bind(cos))

const lazyUpdate = (Key, Body) => getObject({ Key, Bucket: process.env.BUCKET, Region: 'ap-chengdu' })
  .catch(e => console.error(e) || { Body: '' })
  .then(it => it.Body.toString() !== Body && putObject({ Key, Body, Bucket: process.env.BUCKET, Region: 'ap-chengdu' }))

const FORGE_URL = 'https://bmclapi2.bangbang93.com/forge/promos'
const OPTIFINE_URL = 'https://bmclapi2.bangbang93.com/optifine/versionList'
const FABRIC_URL = 'https://meta.fabricmc.net/v2/versions'
const VANILLA_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json'

exports.main = async (req, ctx) => {
  const time = new Date()
  console.log('Sync start time:', new Date().toISOString())

  console.log('[sync] Loading mcbbs data...')
  let $ = cheerio.load(await fetch('https://www.mcbbs.net/forum.php').then(it => it.text()))
  const slides = $('.slideshow li').map((_, { children: c }) => {
    const a = $(c[0])
    const url = a.attr('href')
    return {
      url: url.includes('mcbbs.net') ? url : urlJoin('https://www.mcbbs.net/', url),
      title: $(c[1]).text(),
      img: a.children('img').attr('src')
    }
  }).get()
  console.log('[sync] Loaded mcbbs data')

  console.log('[sync] Loaded news data')
  $ = cheerio.load(await fetch('https://www.mcbbs.net/forum-news-1.html').then(it => it.text()))
  const news = []
  $('tbody[id^=normalthread]').each((_, it) => {
    const item = $(it)
    const a = item.find('tr > th > a.xst')
    const title = a.text()
    if (title == null) { return true }

    const span = item.find('tr > td.by > em > span')
    let time = span.html()
    if (time.includes('<span title=')) { time = span.find('span').attr('title') }

    if (news.push({
      time,
      title: title.replace(/&amp;/g, '&'),
      classify: item.find('tr > th > em > a').text(),
      link: urlJoin('http://www.mcbbs.net/', a.attr('href'))
    }) >= 6) { return false }
  })
  console.log('[sync] Loaded news data')

  try {
    await lazyUpdate('news.json', JSON.stringify({ slides, news }))
  } catch (e) {
    console.error('Fail to upload news')
    console.error(e)
  }

  console.log('[sync] Loading fabric data...')
  const fabric = await fetch(FABRIC_URL).then(it => it.json())
  const fabricMap = {}
  fabric.mappings.forEach(({ gameVersion: gv, version: v }) => !(gv in fabricMap) && (fabricMap[gv] = v))
  console.log('[sync] Loaded fabric data')

  console.log('[sync] Loading forge data...')
  const forge = await fetch(FORGE_URL).then(it => it.json())
  const forgeMap = {}
  forge.forEach(({ name, build }) => {
    if (!build) return
    const { version, mcversion, files } = build
    if (mcversion in forgeMap && !name.includes('recommended')) return
    if (!files.some((it) => it.category === 'installer' && it.format === 'jar')) return
    forgeMap[mcversion] = version
  })
  console.log('[sync] Loaded forge data')

  console.log('[sync] Loading optifine data...')
  const optifine = await fetch(OPTIFINE_URL).then(it => it.json())
  const optifineMap = {}
  optifine.forEach(({ mcversion, type, patch }) => (optifineMap[mcversion] = [type, patch]))
  console.log('[sync] Loaded optifine data')

  console.log('[sync] Loading vanilla data...')
  const { latest, versions } = await fetch(VANILLA_URL).then(it => it.json())
  const result = {
    latest: Object.assign(latest, { fabricLoader: fabric.loader[0].version }),
    versions: versions.map(({ id, type, releaseTime: time }) => {
      const ret = { i: id, t: new Date(time).valueOf() / 1000 | 0 } // i:id t:time k:kind a:fabric f:forge o:optifine
      switch (type) {
        case 'old_alpha':
        case 'old_beta':
          ret.k = 2
          break
        case 'release':
          break
        default:
          ret.k = 1
      }
      const fabric = fabricMap[id]
      if (fabric) { ret.a = fabric }
      const forge = forgeMap[id]
      if (forge) { ret.f = forge }
      const optifine = optifineMap[id]
      if (optifine) { ret.o = optifine }
      return ret
    })
  }
  console.log('[sync] Loaded minecraft data')

  try {
    await lazyUpdate('minecraft.json', JSON.stringify(result))
  } catch (e) {
    console.error('Fail to upload minecraft data')
    console.error(e)
  }

  const end = new Date()
  console.log('Sync end time:', end.toISOString())

  console.log(await refresher.flashDirs('https://s.pl.apisium.cn/'))
  console.log('Used time:', (end.getTime() - time.getTime()) + 'ms')
}
