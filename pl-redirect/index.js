exports.main = async req => ({
  statusCode: 302,
  headers: {
    Location: 'https://github.com/Apisium/PureLauncher/releases/latest/download/' + req.path.slice(13)
  }
})
