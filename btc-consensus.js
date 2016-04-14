!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var n;"undefined"!=typeof window?n=window:"undefined"!=typeof global?n=global:"undefined"!=typeof self&&(n=self),n.btcConsensus=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Browser Request
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// UMD HEADER START 
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.returnExports = factory();
  }
}(this, function () {
// UMD HEADER END

var XHR = XMLHttpRequest
if (!XHR) throw new Error('missing XMLHttpRequest')
request.log = {
  'trace': noop, 'debug': noop, 'info': noop, 'warn': noop, 'error': noop
}

var DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

//
// request
//

function request(options, callback) {
  // The entry-point to the API: prep the options object and pass the real work to run_xhr.
  if(typeof callback !== 'function')
    throw new Error('Bad callback given: ' + callback)

  if(!options)
    throw new Error('No options given')

  var options_onResponse = options.onResponse; // Save this for later.

  if(typeof options === 'string')
    options = {'uri':options};
  else
    options = JSON.parse(JSON.stringify(options)); // Use a duplicate for mutating.

  options.onResponse = options_onResponse // And put it back.

  if (options.verbose) request.log = getLogger();

  if(options.url) {
    options.uri = options.url;
    delete options.url;
  }

  if(!options.uri && options.uri !== "")
    throw new Error("options.uri is a required argument");

  if(typeof options.uri != "string")
    throw new Error("options.uri must be a string");

  var unsupported_options = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
  for (var i = 0; i < unsupported_options.length; i++)
    if(options[ unsupported_options[i] ])
      throw new Error("options." + unsupported_options[i] + " is not supported")

  options.callback = callback
  options.method = options.method || 'GET';
  options.headers = options.headers || {};
  options.body    = options.body || null
  options.timeout = options.timeout || request.DEFAULT_TIMEOUT

  if(options.headers.host)
    throw new Error("Options.headers.host is not supported");

  if(options.json) {
    options.headers.accept = options.headers.accept || 'application/json'
    if(options.method !== 'GET')
      options.headers['content-type'] = 'application/json'

    if(typeof options.json !== 'boolean')
      options.body = JSON.stringify(options.json)
    else if(typeof options.body !== 'string')
      options.body = JSON.stringify(options.body)
  }
  
  //BEGIN QS Hack
  var serialize = function(obj) {
    var str = [];
    for(var p in obj)
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    return str.join("&");
  }
  
  if(options.qs){
    var qs = (typeof options.qs == 'string')? options.qs : serialize(options.qs);
    if(options.uri.indexOf('?') !== -1){ //no get params
        options.uri = options.uri+'&'+qs;
    }else{ //existing get params
        options.uri = options.uri+'?'+qs;
    }
  }
  //END QS Hack
  
  //BEGIN FORM Hack
  var multipart = function(obj) {
    //todo: support file type (useful?)
    var result = {};
    result.boundry = '-------------------------------'+Math.floor(Math.random()*1000000000);
    var lines = [];
    for(var p in obj){
        if (obj.hasOwnProperty(p)) {
            lines.push(
                '--'+result.boundry+"\n"+
                'Content-Disposition: form-data; name="'+p+'"'+"\n"+
                "\n"+
                obj[p]+"\n"
            );
        }
    }
    lines.push( '--'+result.boundry+'--' );
    result.body = lines.join('');
    result.length = result.body.length;
    result.type = 'multipart/form-data; boundary='+result.boundry;
    return result;
  }
  
  if(options.form){
    if(typeof options.form == 'string') throw('form name unsupported');
    if(options.method === 'POST'){
        var encoding = (options.encoding || 'application/x-www-form-urlencoded').toLowerCase();
        options.headers['content-type'] = encoding;
        switch(encoding){
            case 'application/x-www-form-urlencoded':
                options.body = serialize(options.form).replace(/%20/g, "+");
                break;
            case 'multipart/form-data':
                var multi = multipart(options.form);
                //options.headers['content-length'] = multi.length;
                options.body = multi.body;
                options.headers['content-type'] = multi.type;
                break;
            default : throw new Error('unsupported encoding:'+encoding);
        }
    }
  }
  //END FORM Hack

  // If onResponse is boolean true, call back immediately when the response is known,
  // not when the full request is complete.
  options.onResponse = options.onResponse || noop
  if(options.onResponse === true) {
    options.onResponse = callback
    options.callback = noop
  }

  // XXX Browsers do not like this.
  //if(options.body)
  //  options.headers['content-length'] = options.body.length;

  // HTTP basic authentication
  if(!options.headers.authorization && options.auth)
    options.headers.authorization = 'Basic ' + b64_enc(options.auth.username + ':' + options.auth.password);

  return run_xhr(options)
}

var req_seq = 0
function run_xhr(options) {
  var xhr = new XHR
    , timed_out = false
    , is_cors = is_crossDomain(options.uri)
    , supports_cors = ('withCredentials' in xhr)

  req_seq += 1
  xhr.seq_id = req_seq
  xhr.id = req_seq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  if(is_cors && !supports_cors) {
    var cors_err = new Error('Browser does not support cross-origin request: ' + options.uri)
    cors_err.cors = 'unsupported'
    return options.callback(cors_err, xhr)
  }

  xhr.timeoutTimer = setTimeout(too_late, options.timeout)
  function too_late() {
    timed_out = true
    var er = new Error('ETIMEDOUT')
    er.code = 'ETIMEDOUT'
    er.duration = options.timeout

    request.log.error('Timeout', { 'id':xhr._id, 'milliseconds':options.timeout })
    return options.callback(er, xhr)
  }

  // Some states can be skipped over, so remember what is still incomplete.
  var did = {'response':false, 'loading':false, 'end':false}

  xhr.onreadystatechange = on_state_change
  xhr.open(options.method, options.uri, true) // asynchronous
  if(is_cors)
    xhr.withCredentials = !! options.withCredentials
  xhr.send(options.body)
  return xhr

  function on_state_change(event) {
    if(timed_out)
      return request.log.debug('Ignoring timed out state change', {'state':xhr.readyState, 'id':xhr.id})

    request.log.debug('State change', {'state':xhr.readyState, 'id':xhr.id, 'timed_out':timed_out})

    if(xhr.readyState === XHR.OPENED) {
      request.log.debug('Request started', {'id':xhr.id})
      for (var key in options.headers)
        xhr.setRequestHeader(key, options.headers[key])
    }

    else if(xhr.readyState === XHR.HEADERS_RECEIVED)
      on_response()

    else if(xhr.readyState === XHR.LOADING) {
      on_response()
      on_loading()
    }

    else if(xhr.readyState === XHR.DONE) {
      on_response()
      on_loading()
      on_end()
    }
  }

  function on_response() {
    if(did.response)
      return

    did.response = true
    request.log.debug('Got response', {'id':xhr.id, 'status':xhr.status})
    clearTimeout(xhr.timeoutTimer)
    xhr.statusCode = xhr.status // Node request compatibility

    // Detect failed CORS requests.
    if(is_cors && xhr.statusCode == 0) {
      var cors_err = new Error('CORS request rejected: ' + options.uri)
      cors_err.cors = 'rejected'

      // Do not process this request further.
      did.loading = true
      did.end = true

      return options.callback(cors_err, xhr)
    }

    options.onResponse(null, xhr)
  }

  function on_loading() {
    if(did.loading)
      return

    did.loading = true
    request.log.debug('Response body loading', {'id':xhr.id})
    // TODO: Maybe simulate "data" events by watching xhr.responseText
  }

  function on_end() {
    if(did.end)
      return

    did.end = true
    request.log.debug('Request done', {'id':xhr.id})

    xhr.body = xhr.responseText
    if(options.json) {
      try        { xhr.body = JSON.parse(xhr.responseText) }
      catch (er) { return options.callback(er, xhr)        }
    }

    options.callback(null, xhr, xhr.body)
  }

} // request

request.withCredentials = false;
request.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;

//
// defaults
//

request.defaults = function(options, requester) {
  var def = function (method) {
    var d = function (params, callback) {
      if(typeof params === 'string')
        params = {'uri': params};
      else {
        params = JSON.parse(JSON.stringify(params));
      }
      for (var i in options) {
        if (params[i] === undefined) params[i] = options[i]
      }
      return method(params, callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  return de
}

//
// HTTP method shortcuts
//

var shortcuts = [ 'get', 'put', 'post', 'head' ];
shortcuts.forEach(function(shortcut) {
  var method = shortcut.toUpperCase();
  var func   = shortcut.toLowerCase();

  request[func] = function(opts) {
    if(typeof opts === 'string')
      opts = {'method':method, 'uri':opts};
    else {
      opts = JSON.parse(JSON.stringify(opts));
      opts.method = method;
    }

    var args = [opts].concat(Array.prototype.slice.apply(arguments, [1]));
    return request.apply(this, args);
  }
})

//
// CouchDB shortcut
//

request.couch = function(options, callback) {
  if(typeof options === 'string')
    options = {'uri':options}

  // Just use the request API to do JSON.
  options.json = true
  if(options.body)
    options.json = options.body
  delete options.body

  callback = callback || noop

  var xhr = request(options, couch_handler)
  return xhr

  function couch_handler(er, resp, body) {
    if(er)
      return callback(er, resp, body)

    if((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
      // The body is a Couch JSON object indicating the error.
      er = new Error('CouchDB error: ' + (body.error.reason || body.error.error))
      for (var key in body)
        er[key] = body[key]
      return callback(er, resp, body);
    }

    return callback(er, resp, body);
  }
}

//
// Utility
//

function noop() {}

function getLogger() {
  var logger = {}
    , levels = ['trace', 'debug', 'info', 'warn', 'error']
    , level, i

  for(i = 0; i < levels.length; i++) {
    level = levels[i]

    logger[level] = noop
    if(typeof console !== 'undefined' && console && console[level])
      logger[level] = formatted(console, level)
  }

  return logger
}

function formatted(obj, method) {
  return formatted_logger

  function formatted_logger(str, context) {
    if(typeof context === 'object')
      str += ' ' + JSON.stringify(context)

    return obj[method].call(obj, str)
  }
}

// Return whether a URL is a cross-domain request.
function is_crossDomain(url) {
  var rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/

  // jQuery #8138, IE may throw an exception when accessing
  // a field from window.location if document.domain has been set
  var ajaxLocation
  try { ajaxLocation = location.href }
  catch (e) {
    // Use the href attribute of an A element since IE will modify it given document.location
    ajaxLocation = document.createElement( "a" );
    ajaxLocation.href = "";
    ajaxLocation = ajaxLocation.href;
  }

  var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || []
    , parts = rurl.exec(url.toLowerCase() )

  var result = !!(
    parts &&
    (  parts[1] != ajaxLocParts[1]
    || parts[2] != ajaxLocParts[2]
    || (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? 80 : 443))
    )
  )

  //console.debug('is_crossDomain('+url+') -> ' + result)
  return result
}

// MIT License from http://phpjs.org/functions/base64_encode:358
function b64_enc (data) {
    // Encodes string using MIME base64 algorithm
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc="", tmp_arr = [];

    if (!data) {
        return data;
    }

    // assume utf8 data
    // data = this.utf8_encode(data+'');

    do { // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = o1<<16 | o2<<8 | o3;

        h1 = bits>>18 & 0x3f;
        h2 = bits>>12 & 0x3f;
        h3 = bits>>6 & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    enc = tmp_arr.join('');

    switch (data.length % 3) {
        case 1:
            enc = enc.slice(0, -2) + '==';
        break;
        case 2:
            enc = enc.slice(0, -1) + '=';
        break;
    }

    return enc;
}
    return request;
//UMD FOOTER START
}));
//UMD FOOTER END

},{}],2:[function(require,module,exports){
module.exports.Blockchain = function(sources, options) {

    if (!sources || !sources.length) {
        throw ("new Blockchain requires sources input parameter");
    }

    this.address = function(addr, handler) {
        var responses = [];
        // Get address data from each source
        for (var i=0; i<sources.length; i++) {
            (function(index) {
                var source = sources[index];
                source.address(addr, function(err, data) {
                    // Handle error if it exists
                    if (err) {
                        responses[index] = {}; // result is in but is meaningless
                    }
                    else {
                        responses[index] = data; // cache this result
                    }
                    // See if ready to aggregate responses
                    for (var j=0; j<responses.length; j++) {
                        if (typeof responses[j] == "undefined") {
                            // Not ready to aggregate
                            return;
                        }
                    }
                    // Aggregate the responses
                    var response = aggregate(responses);
                    handler(null, response);
                });
            })(i);
        }
    }

    this.utxos = function(addr, handler) {
        var responses = [];
        // Get utxo data from each source
        for (var i=0; i<sources.length; i++) {
            (function(index) {
                var source = sources[index];
                source.utxos(addr, function(err, data) {
                    // Handle error if it exists
                    if (err) {
                        responses[index] = {}; // result is in but is meaningless
                    }
                    else {
                        responses[index] = data; // cache this result
                    }
                    // See if ready to aggregate responses
                    for (var j=0; j<responses.length; j++) {
                        if (typeof responses[j] == "undefined") {
                            // Not ready to aggregate
                            return;
                        }
                    }
                    // Aggregate the responses
                    var response = aggregate(responses);
                    handler(null, response);
                });
            })(i);
        }
    }

}

// Collapse multiple responses into a single response.
function aggregate(responses) {
    var firstResponse = responses[0];
    if (isArray(firstResponse)) {
        return aggregateArrays(responses);
    }
    else {
        return aggregateObjects(responses);
    }
}
module.exports.aggregate = aggregate; // ugly, but exporting aids testing

// Aggregates a number of objects into a single object with the most common
// value for each key.
function aggregateObjects(responses) {
    // Group all values for different keys together
    var collated = {};
    for (var i=0; i<responses.length; i++) {
        var response = responses[i];
        for (var key in response) {
            if (!(key in collated)) {
                collated[key] = [];
            }
            var value = response[key];
            collated[key].push(value);
        }
    }
    // For each key's group of values, use the mode
    var modes = {};
    for (var key in collated) {
        var values = collated[key];
        var value = statisticalMode(values);
        modes[key] = value;
    }
    return modes;
}

// Aggregates a number of array into a single array with the most common
// value for each index. Assumes sorting is consistent for all arrays.
function aggregateArrays(responses) {
    // Group all values for each index together.
    // Assumes that each response is sorted in the same order.
    var collated = {};
    for (var i=0; i<responses.length; i++) {
        var response = responses[i];
        for (var j=0; j<response.length; j++) {
            if (!(j in collated)) {
                collated[j] = [];
            }
            var value = response[j];
            collated[j].push(value);
        }
    }
    // For each index's group of values, use the mode
    var modes = [];
    for (var key in collated) {
        var values = collated[key];
        var value = statisticalMode(values);
        modes[key] = value;
    }
    return modes;
}

function isArray(val) {
    return Object.prototype.toString.call(val) === '[object Array]';
}

function statisticalMode(values) {
    // multimodal values are handled by using the first instance
    // eg [1,2] returns 1 as the mode
    var valCounts = {};
    var commonestVal = null;
    var commonestValCount = 0;
    // Count instances of each value
    for (var i=0; i<values.length; i++) {
        var value = values[i];
        if (!(value in valCounts)) {
            valCounts[value] = 0;
        }
        valCounts[value]++;
        // Track most common value
        if (valCounts[value] > commonestValCount) {
            commonestValCount = valCounts[value];
            commonestVal = value;
        }
    }
    return commonestVal;
}

module.exports.Sources = {};
module.exports.Sources.Blank = require("./sources/blank_source.js").Blank;
module.exports.Sources.BlockchainDotInfo = require("./sources/blockchain_dot_info.js").BlockchainDotInfo;
module.exports.Sources.BlockrDotIo = require("./sources/blockr_dot_io.js").BlockrDotIo;
module.exports.Sources.Insight = require("./sources/insight.js").Insight;

},{"./sources/blank_source.js":3,"./sources/blockchain_dot_info.js":4,"./sources/blockr_dot_io.js":5,"./sources/insight.js":6}],3:[function(require,module,exports){
exports.Blank = function() {

    this.address = function(addr, handler) {
        var blankResult = {
            address: addr,
            balance: 0,
            balance_confirmed: 0,
            balance_unconfirmed: 0,
            is_valid: true,
            total_received_gross: 0,
            total_received_net: 0,
            total_sent_gross: 0,
            total_sent_net: 0,
            tx_count: 0,
        };
        handler(null, blankResult);
    }

    this.utxos = function(addr, handler) {
        var blankResult = [
            {
                tx_id: "",
                tx_output: 0,
                amount: 0,
                confirmations: 2,
            },
            {
                tx_id: "",
                tx_output: 0,
                amount: 0,
                confirmations: 1,
            }
        ];
        handler(null, blankResult);
    }

}

},{}],4:[function(require,module,exports){
var request = require('request');

exports.BlockchainDotInfo = function() {

    this.address = function(addr, handler) {
        var url = "https://blockchain.info/address/" + addr + "?format=json";
        request.get({
            url: url,
            json: true,
        }, function(err, response, data) {
            if (err) {
                handler(err);
            }
            if (response.statusCode != 200) {
                handle("blockchain_dot_info statusCode: " + response.statusCode);
            }
            var result = {
                address: addr,
                balance: data.final_balance,
                total_received_net: data.total_received,
                total_sent_net: data.total_sent,
                tx_count: data.n_tx,
            };
            handler(null, result);
        });
    }

    this.utxos = function(addr, handler) {
        var url = "https://blockchain.info/unspent?active=" + addr;
        request.get({
            url: url,
            json: true,
        }, function(err, response, data) {
            if (err) {
                handler(err);
            }
            if (response.statusCode != 200) {
                handle("blockchain_dot_info statusCode: " + response.statusCode);
            }
            if ("notice" in data) {
                // eg "This wallet contains a very large number of small unspent inputs. Ignoring some."
                // for 1BitcoinEaterAddressDontSendf59kuE
                // TODO handle this situation
            }
            var utxos = [];
            for (var i=0; i<data.unspent_outputs.length; i++) {
                var dataUtxo = data.unspent_outputs[i];
                var utxo = {
                    tx_id: dataUtxo.tx_hash,
                    tx_output: dataUtxo.tx_output_n,
                    amount: dataUtxo.value,
                    confirmations: dataUtxo.confirmations,
                };
                utxos.push(utxo);
            }
            // Sort oldest utxo first
            // TODO consider multiple utxos with same confirmations, and how it
            // affects sorting and thus correlation when aggregating.
            utxos.sort(function(a,b) {
                return a.confirmations < b.confirmations;
            });
            handler(null, utxos);
        });
    }

}

},{"request":1}],5:[function(require,module,exports){
var request = require('request');

exports.BlockrDotIo = function() {

    this.address = function(addr, handler) {
        var url = "https://btc.blockr.io/api/v1/address/info/" + addr;
        request.get({
            url: url,
            json: true,
        }, function(err, response, data) {
            if (err) {
                handler(err);
            }
            if (response.statusCode != 200) {
                handle("blockr_dot_io statusCode: " + response.statusCode);
            }
            var result = {
                address: addr,
                balance: data.data.balance * 1e8,
                is_valid: data.data.is_valid,
                total_received_net: data.data.totalreceived * 1e8,
                tx_count: data.data.nb_txs,
            };
            handler(null, result);
        });
    }

    this.utxos = function(addr, handler) {
        var url = "https://btc.blockr.io/api/v1/address/unspent/" + addr;
        request.get({
            url: url,
            json: true,
        }, function(err, response, data) {
            if (err) {
                handler(err);
            }
            if (response.statusCode != 200) {
                handle("blockr_dot_io statusCode: " + response.statusCode);
            }
            if (data.status != "success") {
                handle("blockr_dot_io status: " + data.status);
            }
            var utxos = [];
            for (var i=0; i<data.data.unspent.length; i++) {
                var dataUtxo = data.data.unspent[i];
                var utxo = {
                    tx_id: dataUtxo.tx,
                    tx_output: dataUtxo.n,
                    amount: parseFloat(dataUtxo.amount) * 1e8,
                    confirmations: dataUtxo.confirmations,
                };
                utxos.push(utxo);
            }
            // Sort oldest utxo first
            // TODO consider multiple utxos with same confirmations, and how it
            // affects sorting and thus correlation when aggregating.
            utxos.sort(function(a,b) {
                return a.confirmations < b.confirmations;
            });
            handler(null, utxos);
        });
    }

}

},{"request":1}],6:[function(require,module,exports){
var request = require('request');

exports.Insight = function(root) {

    // Default to bitpay version of insight[ they are the creators and host the
    // source code.
    if (typeof root === "undefined") {
        root = "https://insight.bitpay.com";
    }
    // remove trailing slashes from root
    root = root.replace(/\/+$/g, "");

    this.address = function(addr, handler) {
        var url = root + "/api/addr/" + addr + "?noTxList=1&noCache=1";
        request.get({
            url: url,
            json: true,
        }, function(err, response, data) {
            if (err) {
                handler(err);
            }
            if (response.statusCode != 200) {
                handle("insight statusCode: " + response.statusCode);
            }
            var result = {
                address: addr,
                balance: data.balanceSat,
                balance_unconfirmed: data.unconfirmedBalanceSat,
                total_received_gross: data.totalReceivedSat,
                total_sent_gross: data.totalSentSat,
                tx_count: data.txApperances,
            };
            handler(null, result);
        });
    }

    this.utxos = function(addr, handler) {
        var url = "https://insight.bitpay.com/api/addr/" + addr + "/utxo?noCache=1";
        request.get({
            url: url,
            json: true,
        }, function(err, response, data) {
            if (err) {
                handler(err);
            }
            if (response.statusCode != 200) {
                handle("insight statusCode: " + response.statusCode);
            }
            var utxos = [];
            for (var i=0; i<data.length; i++) {
                var dataUtxo = data[i];
                var utxo = {
                    tx_id: dataUtxo.txid,
                    tx_output: dataUtxo.vout,
                    amount: dataUtxo.amount * 1e8,
                    confirmations: dataUtxo.confirmations,
                };
                utxos.push(utxo);
            }
            // Sort oldest utxo first
            // TODO consider multiple utxos with same confirmations, and how it
            // affects sorting and thus correlation when aggregating.
            utxos.sort(function(a,b) {
                return a.confirmations < b.confirmations;
            });
            handler(null, utxos);
        });
    }

}

},{"request":1}]},{},[2])(2)
});