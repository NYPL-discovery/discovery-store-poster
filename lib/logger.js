const winston = require('winston')
winston.emitErrs = false

// Set logging level to LOGLEVEL if explicitly set in ENV
// Otherwise set it to 'info' for production and 'debug' elsewhere
const logLevel = process.env['LOGLEVEL'] || ((process.env.NODE_ENV === 'production') ? 'info' : 'debug')

let loggerTransports = []

// spewing logs while running tests is annoying
if (process.env.NODE_ENV !== 'test') {
  loggerTransports.push(new winston.transports.Console({
    level: logLevel,
    handleExceptions: true,
    json: false,
    stringify: true,
    colorize: true,
    formatter: (options) => {
      let outputObject = {
        level: options.level.toUpperCase(),
        message: options.message,
        timestamp: new Date().toISOString()
      }

      return JSON.stringify(Object.assign(outputObject, options.meta))
    }
  }))
}

let logger = new winston.Logger({
  transports: loggerTransports,
  exitOnError: false
})

/**
 * Set level dynamically from requiring code
 */
logger.setLevel = (level) => {
  // Have to apply it directly to each relevant transport:
  logger.transports.console.level = level
}

module.exports = logger
