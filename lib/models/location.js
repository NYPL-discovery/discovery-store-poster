'use strict'

const Base = require('./base')

class Location extends Base {
  deliveryLocations () {
    if (this._deliveryLocations) return Promise.resolve(this._deliveryLocations)

    this._deliveryLocations = []
    if (this.objectIds('nypl:deliverableTo')) {
      return Promise.all(
        this.objectIds('nypl:deliverableTo').map((deliveryId) => Location.byId(deliveryId.split(':')[1]))
      ).then((deliveryLocations) => {
        this._deliveryLocations = deliveryLocations
        return this._deliveryLocations
      })
    } else return Promise.resolve(this._deliveryLocations)
  }
}

Location.byId = (id, opts) => {
  opts = opts || {}
  opts = Object.assign({
    withDeliveryLocations: false
  })
  return Base.byId(Location, id)
}

module.exports = Location
