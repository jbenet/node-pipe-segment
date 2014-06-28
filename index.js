var extend = require('xtend')
var Readable = require('stream').Readable
var noop = function() {}

module.exports = Segment

function Segment(streams) {
  if (!(this instanceof Segment))
    return new Segment(streams)

  // create errors stream. all Segments have it.
  // all segment pieces output errors through it
  var error = Readable({objectMode: true, highWaterMark: 16})
  error._read = noop

  // defaults + copy object
  var defaults = { error: error }
  streams = extend(defaults, streams)

  // patch streams into object for convenience
  for (var name in streams)
    this[name] = streams[name]

  // allow grabbing all streams
  this.streams = streams

  // fwd errors
  var self = this
  function errcb(label) {
    return function(err) {
      error.push({ error: err, label: label})
      // perhaps should end all streams here??
    }
  }

  for (var name in streams)
    if (name != 'error')
      streams[name].on('error', errcb(name))
}
