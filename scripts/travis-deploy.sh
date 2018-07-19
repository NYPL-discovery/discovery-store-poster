#!/bin/bash

# This script is called by Travis to deploy the app for a named environment.
# It derives the deploy command from package.json, replaces --profile with
# relevant AWS_ environment variables, and executes the resulting command.

# Fail if ENVIRONMENT param invalid:
if ! [[ $1 =~ ^(development|qa|production) ]] ; then
  echo Aborting travis-deploy. Must specify ENVIRONMENT.
  echo Usage: ./scripts/travis-deploy ENVIRONMENT
  echo "  Where ENVIRONMENT is (development|qa|production)"
  exit
fi

ENVIRONMENT_NAME=$1
ENVIRONMENT_CAPS=$(echo $ENVIRONMENT_NAME | awk '{print toupper($0)}')

# Extract relevant deploy script from package.json:
DEPLOY_CMD=$(cat package.json | jq ".scripts | .\"deploy-$ENVIRONMENT_NAME\"" --raw-output)

# Replace --profile in command with environment-specific environment variables
# known to be set in travis:
DEPLOY_CMD=$(echo "$DEPLOY_CMD" | sed "s/ --profile [a-z-]*/ -a \$AWS_ACCESS_KEY_ID_$ENVIRONMENT_CAPS -s \$AWS_SECRET_ACCESS_KEY_$ENVIRONMENT_CAPS/g")

echo Running deploy command for "$ENVIRONMENT_NAME" environment:
echo "  $DEPLOY_CMD"

# Execute command:
eval $DEPLOY_CMD
