const dotenv = require('dotenv')

before(() => {
  dotenv.config({ path: './config/test.env' })
})
