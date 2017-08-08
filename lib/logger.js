const winston = require('winston')
winston.emitErrs = false

// Set logging level to LOGLEVEL if explicitly set in ENV
// Otherwise set it to 'info' for production and 'debug' elsewhere
const logLevel = process.env['LOGLEVEL'] || ((process.env.NODE_ENV === 'production') ? 'info' : 'debug')

let loggerTransports = [
  new winston.transports.File({
    level: logLevel,
    filename: './log/pcdm-store-updater.log',
    handleExceptions: true,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    colorize: false,
    json: false,
    formatter: (options) => {
      let outputObject = {
        level: options.level.toUpperCase(),
        message: options.message,
        timestamp: new Date().toISOString()
      }

      return JSON.stringify(Object.assign(outputObject, options.meta))
    }
  })
]

// spewing logs while running tests is annoying
if (process.env.NODE_ENV !== 'test') {
  loggerTransports.push(new winston.transports.Console({
    level: logLevel,
    handleExceptions: true,
    json: true,
    stringify: true,
    colorize: true
  }))
}

const logger = new winston.Logger({
  transports: loggerTransports,
  exitOnError: false
})

module.exports = logger
