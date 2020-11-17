// defines avro schema
module.exports = {
  name: 'Document',
  type: 'record',
  fields: [
    { name: 'uri', type: 'string' },
    { name: 'type', type: 'string' }
  ]
}
