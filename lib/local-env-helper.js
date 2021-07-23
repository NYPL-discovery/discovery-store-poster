/**
 *  This include should be required by any cmd-line utility that requires AWS
 *  credentials and environment-specific ENV variables. By including this file,
 *  the process.argv will be inspected for the following params:
 *
 *   - `--profile`: AWS profile to use
 *   - `--envfile`: Path to an environment env file containing deployable ENV
 *                  variables (e.g. config/qa.env)
 *
 *  Both parameters are required. If either is missing, an Error will be thrown.
 *
 *  When both parameters are given, any aws-sdk calls made subsequently will be
 *  auth'd against the indicated account and the ENV will be populated with the
 *  contents of the given envfile.
 */

const aws = require('aws-sdk')
const dotenv = require('dotenv')

function setProfile (profile) {
  // Set aws creds:
  aws.config.credentials = new aws.SharedIniFileCredentials({
    profile: profile
  })

  // Set aws region:
  const awsSecurity = { region: 'us-east-1' }
  aws.config.update(awsSecurity)
}

var argv = require('optimist').argv

// Require both --profile and --envfile
if (!argv.profile) throw new Error('--profile [aws profile] is a required flag')
if (!argv.envfile) throw new Error('--envfile config/[environment].env is a required flag')

// Load nypl-data-api-client required config:
dotenv.config({ path: argv.envfile })

// Set active aws profile (so that kms knows how to decrypt things)
setProfile(argv.profile)
