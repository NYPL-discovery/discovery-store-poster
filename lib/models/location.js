'use strict'

const Base = require('./base')
const db = require('../db')

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
  /* .then((location) => {
    if (opts.withDeliveryLocations && location.objectIds('nypl:deliveryLocations')) {
      return Promise.all(
        location.objectIds('nypl:deliveryLocations').map((deliveryId) => {
          return Location.byId(deliveryId.split(':')[1])
        })
      ).then((deliveryLocations) => Object.{
        location.deliveryLocations = deliveryLocations
        return location
      })
    } else {
      return location
    }
  })
  */
}

module.exports = Location
