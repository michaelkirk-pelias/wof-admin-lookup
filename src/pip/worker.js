/**
 * A worker processes intended to be launched by the `./master.js` module.
 * Loads one polygon layer into memory, builds a `PolygonLookup` for it, and
 * then returns intersection results for `search` queries.
 */

var logger = require( 'pelias-logger').get('admin-lookup:worker');
var PolygonLookup = require('polygon-lookup');

var readStream = require('./readStream');
const fs = require('fs');

var context = {
  adminLookup: null,// This worker's `PolygonLookup`.
  layer: '', // The name of this layer (eg, 'country', 'neighborhood').
  featureCollection: {
    features: []
  }
};

/**
 * Respond to messages from the parent process
 */
function messageHandler( msg ) {
  switch (msg.type) {
    case 'load'   : return handleLoadMsg(msg);
    case 'search' : return handleSearch(msg);
    default       : logger.error('Unknown message:', msg);
  }
}

process.on( 'message', messageHandler );

function elapsedTime() {
  return ((Date.now() - context.startTime)/1000);
}

function handleLoadMsg(msg) {
  context.layer = msg.layer;
  process.title = context.layer;
  context.startTime = Date.now();

  readStream(msg.datapath, msg.layer, msg.localizedAdminNames, (features) => {
    // find all the properties of all features and write them to a file
    // at the same time, limit the feature.properties to just Id since it's all that's needed in the worker
    const data = features.reduce((acc, feature) => {
      acc[feature.properties.Id] = feature.properties;
      feature.properties = {
        Hierarchy: feature.properties.Hierarchy
      };
      return acc;
    }, {});

    fs.writeFileSync(`wof-${context.layer}-data.json`, JSON.stringify(data));

    context.featureCollection.features = features;
    context.adminLookup = new PolygonLookup( context.featureCollection );

    process.send( {
      type: 'loaded',
      layer: context.layer,
      seconds: elapsedTime()
    });

  });

}

function handleSearch(msg) {
  // console.log(`${context.layer} received request for ${JSON.stringify(msg.coords)}`);
  process.send({
    layer: context.layer,
    type: 'results',
    id: msg.id,
    results: search( msg.coords )
  });
}

/**
 * Search `adminLookup` for `latLon`.
 */
function search( latLon ){
  var poly = context.adminLookup.search( latLon.longitude, latLon.latitude );

  return (poly === undefined) ? {} : poly.properties;
}
