var multihash = require('multihashes')
var CkBuffer = require('checksum-buffer')
var through2 = require('through2')
var duplexer2 = require('duplexer2')
var segment = require('./')
var filterSegment = require('pipe-segment-filter')

function cksumWrap(func) {
  func = multihash.coerceCode(func) // ensure valid func code
  return through2.obj(cksumAdd)

  function cksumAdd(buf, enc, next) {
    this.push(CkBuffer(buf, func).buffer)
    next()
  }
}

function cksumUnwrap() { // dont need func
  return through2.obj(cksumRemove)

  function cksumRemove(ckbuf, enc, next) {
    this.push(CkBuffer(ckbuf).data())
    next()
  }
}

// filterSegment is like a T pipe segment.
// it returns a segment object, with three streams:
// - segment.input
// - segment.output
// - segment.filtered

function cksumCheckSegment(func) {
  // func = optional check for a specific multihash function
  if (func) func = multihash.coerceCode(func)
  return filterSegment(cksumCheck)

  function cksumCheck(buf) {
    var ckbuf = CkBuffer(buf)
    if (func && ckbuf.mhparams.code !== func)
      return false
    return ckbuf.check()
  }
}



function integrityTransportSegment(cksumFunc) {
  //  raw   ----------- wrap ------->  cksum
  //  side  <--- unwrap --- check ---  side

  // make the internal streams
  var check = cksumCheckSegment(cksumFunc)
  var wrap = cksumWrap(cksumFunc)
  var unwrap = cksumUnwrap()

  // wire up the internal streams
  check.output.pipe(unwrap)

  // make duplex interfaces for each "side" of the streams
  var side1 = duplexer2(wrap, unwrap) // read from unwrap, write to wrap
  var side2 = duplexer2(check.input, wrap)
  // read from wrap, write to check.input

  return segment({
    'raw': side1,
    'checksum': side2,
    'filtered': check.filtered,
  })
}


function logLabel(label) {
  return through2.obj(function(item, enc, next) {
    var d = item.inspect ? item.inspect() : JSON.stringify(item)
    console.log(label + ': ' + d)
    this.push(item)
    next()
  })
}

function corrupt(p) {
  return through2.obj(function(item, enc, next) {
    if (Math.random() < (p || 0.1))
      item[item.length - 1] = 0x00
    this.push(item)
    next()
  })
}

var its = integrityTransportSegment('sha1')

var ll1 = logLabel('raw outgoing')
var ll2 = logLabel('cksum output')
var ll3 = logLabel('raw incoming')
var ll4 = logLabel('filtered')

process.stdin.pipe(ll1).pipe(its.raw).pipe(ll3)
its.checksum.pipe(ll2).pipe(corrupt(0.1)).pipe(its.checksum)
its.filtered.pipe(ll4)

its.error.pipe(logLabel('error')).pipe(process.stderr)
