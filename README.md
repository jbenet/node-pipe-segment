# node-pipe-segment

Think of a pipe-segment as a bundle of streams, that do one thing together. See the discussion here: https://github.com/jbenet/random-ideas/issues/24 . Pipe segments are designed to be joined together into more complicated pipelines. It's similar in spirit to [substack/labeled-stream-splicer](https://github.com/substack/labeled-stream-splicer), but rather than making one big pipeline, it uses segments that expose different streams for different things.

Inherit from this module and follow the pattern to make reusable components that can be joined together.

## Install

```
npm install pipe-segment
```

## Examples


### Integrity Checksum pipe segment

Let's make a stream that wraps raw data with checksums (into a `checksum-buffer`). This is just a simple transform stream.

```js
var multihash = require('multihashes')
var CkBuffer = require('checksum-buffer')
var through2 = require('through2')

function cksumWrap(func) {
  func = multihash.coerceCode(func) // ensure valid func code
  return through2.obj(cksumAdd)

  function cksumAdd(buf, enc, next) {
    return CkBuffer(buf, func).buffer
  }
}
```

And one that unwraps a `checksum-buffer`. This is just a simple transform stream again.

```js
var multihash = require('multihashes')
var CkBuffer = require('checksum-buffer')
var through2 = require('through2')

function cksumUnwrap() { // dont need func
  return through2.obj(cksumRemove)

  function cksumRemove(ckbuf, enc, next) {
    return CkBuffer(ckbuf).data()
  }
}
```

Now, let's make a _segment_ that checks the checksum on a `checksum-buffer`. A segment is like a _bundle_ of streams that are all related. This one is basically a `pipe-segment-filter`, so its stream interfaces will be `input`, `output`, and `failed`.

```js
var CkBuffer = require('checksum-buffer')
var filterSegment = require('pipe-segment-filter')
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
```

Now, let's make a checksum integrity checked `pipe-segment`.

```js
// we'll reuse the two functions above
var segment = require('pipe-segment') // makes pipe segments
var duplexer2 = require('duplexer2')

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
  var side1 = duplexer2(unwrap, wrap) // read from unwrap, write to wrap
  var side2 = duplexer2(wrap, check.input)
  // read from wrap, write to check.input

  return segment({
    'raw': side1,
    'checksum': side2,
    'filtered': check.filtered,
  })
}
```

Boom, now we have a T pipe that wraps/unwraps/checks multihash checksums.
