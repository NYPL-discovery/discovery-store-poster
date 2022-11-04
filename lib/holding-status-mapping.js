const notAvailable = { id: 'status:na', label: 'Not Available (ReCAP' }
const available = { id: 'status:a', label: 'Available' }
const bindery = { id: 'status:i', label: 'At bindery' }

module.exports = {
  A: available,
  B: notAvailable,
  E: notAvailable,
  L: notAvailable,
  M: { id: 'status:m', label: 'Missing' },
  N: notAvailable,
  O: notAvailable,
  P: available,
  R: { id: 'status:w', label: 'Withdrawn' },
  S: bindery,
  T: bindery,
  U: notAvailable
}
