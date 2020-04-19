exports.main = async req => ({
  statusCode: 302,
  headers: {
    Location: 'https://github.com/Apisium/PureLauncher/releases/latest/download/' + // 'https://github.com/Apisium/PureLauncher/releases/latest/download/'
      (req.headers['X-Arch'] === '64' ? 'x64' : 'ia32') + '.nsis.7z'
  }
})
