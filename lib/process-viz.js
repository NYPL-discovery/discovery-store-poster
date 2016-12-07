'use strict'

var blessed = require('blessed')
var contrib = require('blessed-contrib')

/*
 *  Simple interface full-terminal visualization of a multi-threaded indexing process
 *  See IndexRunner
 *  TODO Should really be an event listener interface rather than requiring direct hooks in processing script
 */
class ProcessViz {

  constructor () {
    this.screen = blessed.screen()

    var grid = new contrib.grid({rows: 12, cols: 12, screen: this.screen})
    this.active_bots_table = grid.set(0, 0, 5, 8, contrib.table, {keys: true, columnWidth: [4, 8, 8, 8, 4, 8]})
    this.progress_donut = grid.set(0, 8, 4, 4, contrib.donut, {label: 'Progress'}, {radius: 8})
    // this.time_remaining = grid.set(4, 8, 1, 4, contrib.lcd, {color: 'green', label: 'Time remaining'})
    this.time_remaining = grid.set(4, 8, 1, 4, contrib.markdown, {color: 'green', label: 'Time remaining'})
    this.velocity_chart = grid.set(8, 0, 4, 8, contrib.line, {
      label: 'Velocity',
      showLegend: true,
      legend: {width: 30},
      maxY: 1500
    })
    this.message_log = grid.set(5, 0, 3, 8, contrib.log, {label: 'Messages'})

    this.screen.key(['C-c'], function (ch, key) {
      return process.exit(0)
    })

    this.velocitySamples = []
    this.active_bots_data = {}

    this.jobCount = null

    this.totalProcessed = 0

    this._monitorVelocities()
    this._monitorEstimatedCompletion()
  }

  // Set global property
  setOverall (what, value) {
    switch (what) {
      case 'total':
        this.setJobCount(value)
        break
      case 'processed':
        this.notifyProcessed(value)
        break
    }
  }

  // Log a message
  log () {
    var message = Object.keys(arguments).map((k) => arguments[k])
    this.message_log.log(message.join(' '))
  }

  // Set arbitrary property/properties for the indicated worker
  // e.g.
  //   viz.workerSet(ID, {completed: 0, total: limit, skipped: 0, status: 'seeking'})
  workerSet (workerId, data) {
    this.active_bots_data[workerId] = Object.assign({}, this.active_bots_data[workerId], data)
    this.updateActiveBotsTable()
  }

  // Increment the worker property
  // e.g.
  //   viz.workerIncrement(ID, 'completed', 47)
  //   viz.workerIncrement(ID, 'skipped', 3)
  workerIncrement (workerId, property, count) {
    this.active_bots_data[workerId][property] += count
    this.updateActiveBotsTable()
  }

  // End public interface

  setJobCount (c) {
    this.jobCount = c
  }

  notifyProcessed (count) {
    this.totalProcessed = count
    var percent = count / this.jobCount
    this.progress_donut.setData([
      {percent: percent, label: count + ' of ' + this.jobCount, color: 'green'}
    ])
    this.screen.render()
  }

  updateActiveBotsTable () {
    var data = Object.keys(this.active_bots_data).map((id) => {
      var bot = Object.assign({
        completed: 0,
        skipped: 0,
        total: 0,
        status: 'Starting'
      }, this.active_bots_data[id])
      var percent = bot.total > 0 ? Math.floor(100 * bot.completed / bot.total) + '%' : '-'
      return [id, bot.completed, bot.skipped, bot.total, percent, bot.status]
    })
    this.active_bots_table.setData({headers: ['Worker', 'Completed', 'Skipped', 'Total', '%', 'Status'], data: data})
    this.screen.render()
  }

  _monitorVelocities () {
    this.startTime = (new Date()).getTime() / 1000
    this.overallVelocitySamples = []
    this.sampleVelocitySamples = []
    var updateVelocities = () => {
      var ellapsed = ((new Date()).getTime() / 1000) - this.startTime
      this.overallV = this.totalProcessed / ellapsed
      var sampleSize = 10 // seconds
      var sampleV = this.velocitySamples.slice(this.velocitySamples.length - sampleSize).reduce(function (sum, v) { sum += v; return sum }) / sampleSize
      this.overallVelocitySamples.push(this.overallV)

      var numSamples = 180
      if (this.overallVelocitySamples.length > numSamples) this.overallVelocitySamples.shift()
      this.sampleVelocitySamples.push(sampleV)
      if (this.sampleVelocitySamples.length > numSamples) this.sampleVelocitySamples.shift()
      var xLabels = []
      for (var i = 0; i < numSamples; i++) xLabels.push('-' + (numSamples - i) + 's')
      var zeroFill = this.overallVelocitySamples.length < 0 ? [] : Array(numSamples - this.overallVelocitySamples.length).fill(0)
      var sampleData = zeroFill.concat(this.sampleVelocitySamples)
      var overallData = zeroFill.concat(this.overallVelocitySamples)
      this.velocity_chart.setData([
        {title: '10s Sample V: ' + Math.round(sampleV) + '/s', x: xLabels, y: sampleData, style: { line: 'green' }},
        {title: 'Overall V: ' + Math.round(this.overallV) + '/s', x: xLabels, y: overallData, style: { line: 'red' }}
      ])
    }
    var velocityPreviousTotal = 0
    setInterval(() => {
      var speed = this.totalProcessed - velocityPreviousTotal
      this.velocitySamples.push(speed)
      velocityPreviousTotal = this.totalProcessed
      updateVelocities()
    }, 1000)
  }

  _monitorEstimatedCompletion () {
    var _monitor = () => {
      var estimatedCompletion = Math.round((this.jobCount - this.totalProcessed) / this.overallV)
      var displayEta = estimatedCompletion
      var unit = 'S'
      var unitReductions = { D: 3600 * 24, H: 3600, M: 60 }
      for (var _unit in unitReductions) {
        var threshold = unitReductions[_unit]
        if (estimatedCompletion > threshold) {
          unit = _unit
          displayEta = Math.round(estimatedCompletion / threshold)
          break
        }
      }
      var phrase = `${displayEta}${unit}`
      this.time_remaining.setMarkdown(phrase)
      // this.log('Time remaining:' + phrase)
    }

    setInterval(_monitor, 2000)
  }
}

module.exports.ProcessViz = ProcessViz
