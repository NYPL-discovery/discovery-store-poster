/**
 *  Generally usable formatting utils
 */

/**
 *  Given a hash, returns a new hash containing key-value pairs that meet:
 *   1) key must be in given `keys`
 *   2) value must by truthy
 */
const hashByKeysWithTruthyValues = (hash, keys) => {
  return Object.keys(hash)
    .reduce((newHash, key) => {
      const value = hash[key]
      // If the keys requested include this key
      // .. and extracted value is truthy
      // .. include it in new hash.
      if (keys.indexOf(key) >= 0 && value) newHash[key] = value
      return newHash
    }, {})
}

/**
 * Get array of truthy values from hash matching given keys
 *
 * @example
 * truthyValuesByKeys ({ key1: 'value1', key2: 'value2', key3: null }, ['key2'])
 *   => ['value2']
 */
const truthyValuesByKeys = (hash, keys) => {
  hash = hashByKeysWithTruthyValues(hash, keys)
  return Object.keys(hash).map((key) => hash[key])
}

module.exports = {
  truthyValuesByKeys
}
