import * as fs from 'graceful-fs'
var retrieve = require('./retrieve.js')
var index = require('./index.js')
var recursive=require('recursive-readdir')
var Entities = require('html-entities').XmlEntities;
var extract = require('./extract.js')

entities = new Entities();


// ========================================================================================
// THE DAILY FUNCTIONS TO RETRIEVE AND PROCESS ARTICLES EACH DAY
var etl = function(dailyset) {
  var dts = dailyset ? dailyset : dated(delim='-');
  if(!fs.existsSync(Meteor.settings.storedir + '/' + dts)) {
    fs.mkdirSync(Meteor.settings.storedir + '/' + dts);
  }
	var qry = 'FIRST_PDATE:' + dts;
	var urls = retrieve.getpapers(qry, dts, Meteor.settings.storedir); // TODO we somehow need the metadata returned by getpapers for each URL too
 loadEuPMCMDAndFT(dailyset)
};

var loadEuPMCMDAndFT = function (dailyset) {
  index.indexEuPMCMetadata(Meteor.settings.storedir + '/' + dailyset, Meteor.settings.elastichosts)
  emptyFulltext(function () {
    index.loadEuPMCFullTexts(Meteor.settings.storedir + '/' + dailyset, Meteor.settings.elastichosts , function() {extractNew(dailyset)})
  }) // chained to ensure index creation happens in the right order
}

var loadCRMDAndFT = function (setname, type) {
  index.indexCRMetadata(Meteor.settings.storedir + '/' + setname, hosts)
  emptyFulltext(function () {
    index.loadCRFullTexts(Meteor.settings.storedir + '/' + setname, 'fulltext.'+type, Meteor.settings.elastichosts, function() {extractNew(setname)})
  })
}

var createUnstructuredIndex = function (callback) {
  var client = index.ESClient(Meteor.settings.elastichosts)
  client.indices.create({
    index: 'fulltext',
    type: 'unstructured',
    body: {"mappings":{
      "unstructured":{
        "properties":{
          "cprojectID":{"type":"string"},
          "fulltext":{"type":"string","term_vector": "with_positions_offsets_payloads"}}}}
    }
  }, function (err) { console.log(err)
    callback()
  })
}

var emptyFulltext = function(callback) {
  var client = index.ESClient(Meteor.settings.elastichosts)
  fs.stat(Meteor.settings.storedir + '/elasticsearch.lock', (err, stats) => {
    if (!err) {
      throw 'File lock inplace, extraction in progress or delete elasticsearch.lock'
    }
    else if(err.code == 'ENOENT') {
  fs.writeFile(Meteor.settings.storedir + '/elasticsearch.lock', '', (err) => {
    client.indices.delete({
      index: 'fulltext'
    }, function (err) {
      if (err) console.log(err)
      console.log('fulltext index emptied')
      createUnstructuredIndex(callback) })
  })
}
  else throw err
  });
  // Test if lockfile in place; if so reject attempt with error
  // Else place lockfile
}

//updated extraction function being written by tom
var extractNew = function(dailyset) {
  extract.readDictionaries(dailyset, Meteor.settings.elastichosts, Meteor.settings.dictsdir, Meteor.settings.storedir)
}

SyncedCron.add({
	name: 'ETL',
	schedule: function(parser) { return parser.text('at 1:00 am'); },
	job: function() { etl(); }
});
if (Meteor.settings.runcron) SyncedCron.start();

module.exports.etl = etl
module.exports.extract = extractNew
module.exports.loadCRMDAndFT = loadCRMDAndFT
module.exports.loadEuPMCMDAndFT = loadEuPMCMDAndFT
