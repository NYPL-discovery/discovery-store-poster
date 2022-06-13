const AWS = require('aws-sdk')
AWS.config.region = 'us-east-1'
const lambda = new AWS.Lambda()

exports.parseDate = async function (date) {
  const payloadStr = JSON.stringify({
    path: '/',
    body: JSON.stringify({ dates: [date] })
  })
  const params = {
    FunctionName: 'DateParser-production',
    Payload: payloadStr
  }

  try {
    const { Payload } = await lambda.invoke(params).promise()
    console.log(JSON.parse(Payload).body)
  } catch (error) {
    console.error(error)
  }
}
