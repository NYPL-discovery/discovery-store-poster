'use strict'

const sierraLocationMapping = require('@nypl/nypl-core-objects')('by-sierra-location')
const SierraRecord = require('./sierra-record')

// console.log('sierra record class: ', SierraRecord)

class ItemSierraRecord extends SierraRecord {
  prefixedId () {
    var prefix = ''
    if (this.isPartnerRecord()) {
      prefix = this.nyplSource.substring(6, 7).toLowerCase()
    }
    return `${prefix}i${this.id}`
  }

  itemType () {
    let type = null

    // parse from fixed:
    let fixedType = this.fixed('Item Type')
    if (/^\d+$/.test(fixedType)) type = parseInt(fixedType)

    // Partner recap items are hard-coded catalogItemType:1, "General Materials"
    if (this.isPartnerRecord()) type = 1

    return type
  }

  isResearchItem () {
    // If object has location, see if location implies items are definitely Research or definitely Branch
    let holdingLocationCollectionType = null
    if (this.location && this.location.code) {
      let mappedLocation = sierraLocationMapping[this.location.code]
      // If collectionType has only one value, that imples item is definitely that type
      if (mappedLocation && Array.isArray(mappedLocation.collectionTypes) && mappedLocation.collectionTypes.length === 1) {
        holdingLocationCollectionType = mappedLocation[0]
      }
    }

    // Determine if it's a research/branch item type
    // It's a Research item if:
    //   * itemType <= 100
    //   * it's a partner record
    //   * it's an e-resource
    //   * its holdingLocation collectionType is 'Research'
    let isResearch = this.itemType() && this.itemType() <= 100 ||
      this.isPartnerRecord() ||
      this.electronicResources ||
      holdingLocationCollectionType === 'Research'

    // On the other hand, if holdingLocation collectionType is Branch, we know it's NOT research:
    if (holdingLocationCollectionType === 'Branch') isResearch = false

    return isResearch
  }

  getSuppressedWithRationale () {
    // Now that we have both holdingLocation and catalogItemType we can compute `suppressed`:
    var suppressed = false
    var rationale = []

    // For recap CUL/PUL, check 876$x or 900$a for 'Private':
    if (this.isPartnerRecord()) {
      var group = this.varField('876', ['x'])
      if (group && group.length > 0 && group[0] === 'Private') {
        suppressed = true
        rationale.push('876 $x')
      }
      group = this.varField('900', ['a'])
      if (group && group.length > 0 && group[0] === 'Private') {
        suppressed = true
        rationale.push('900 $a')
      }

    // For NYPL recap or on-site items:
    } else {
      // First, we'll suppress it if catalogItemType is 50 (temporary item):
      if (this.itemType() && this.itemType() === 50) {
        suppressed = true
        rationale.push('catalogItemType')
      }
      // Next, we'll suppress it if fixed "Item Code 2" is 's', 'w', 'd', or 'p'
      if (['s', 'w', 'd', 'p'].indexOf(this.fixed('Item Code 2')) >= 0) {
        suppressed = true
        rationale.push('fixed "Item Code 2"')
      }
    }

    return { suppressed, rationale }
  }
}

ItemSierraRecord.from = (record) => {
  return new ItemSierraRecord(record)
}

module.exports = ItemSierraRecord
