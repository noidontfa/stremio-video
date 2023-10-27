var HTMLVideo = require("../HTMLVideo");
var withHTMLDualSubtitles = require("../withHTMLDualSubtitles");
var withVideoParams = require("../withVideoParams");

function selectVideoImplementation(commandArgs, options) {
  return withVideoParams(withHTMLDualSubtitles(HTMLVideo));
}

module.exports = selectVideoImplementation;
