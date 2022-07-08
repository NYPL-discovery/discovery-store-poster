/* global describe it */
const expect = require('chai').expect
const { parseVolume } = require('../lib/volume-parser')

describe('volume parsing', () => {
  it('v. 36-37 (Nov. 1965-Oct. 1967)', () => {
    expect(parseVolume('v. 36-37 (Nov. 1965-Oct. 1967)')[0]).to.deep.equal([36, 37])
  })
  it('vol. 67 (May-Oct. 1996)', () => {
    expect(parseVolume('vol. 67 (May-Oct. 1996')[0]).to.deep.equal([67, 67])
  })
  it('volume 10, no. 1 - 4 (win. - aut. 1976) inde', () => {
    expect(parseVolume('volume 10, no. 1 - 4 (win. - aut. 1976) inde')[0]).to.deep.equal([10, 10])
  })
  it('vol 93, no. 3 (autumn 2013)', () => {
    expect(parseVolume('vol 93, no. 3 (autumn 2013)')[0]).to.deep.equal([93, 93])
  })
  it('v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)', () => {
    expect(parseVolume('v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)')[0]).to.deep.equal([[6, 7], [8, 8]])
  })
  it('v. 6-7 no. 2, 5-v. 8-10 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)', () => {
    expect(parseVolume('v. 6-7 no. 2, 5-v. 8-10 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)')[0]).to.deep.equal([[6, 7], [8, 10]])
  })
})
