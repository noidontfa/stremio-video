var EventEmitter = require("eventemitter3");
var cloneDeep = require("lodash.clonedeep");
var deepFreeze = require("deep-freeze");
var Color = require("color");
var ERROR = require("../error");
var subtitlesParser = require("./subtitlesParser");
var subtitlesRenderer = require("./subtitlesRenderer");
var subtitlesConverter = require("./subtitlesConverter");

function withHTMLSubtitles(Video) {
  function VideoWithHTMLSubtitles(options) {
    options = options || {};

    var video = new Video(options);
    video.on("error", onVideoError);
    video.on("propValue", onVideoPropEvent.bind(null, "propValue"));
    video.on("propChanged", onVideoPropEvent.bind(null, "propChanged"));
    Video.manifest.events
      .filter(function (eventName) {
        return !["error", "propValue", "propChanged"].includes(eventName);
      })
      .forEach(function (eventName) {
        video.on(eventName, onOtherVideoEvent(eventName));
      });

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
      throw new Error(
        "Container element required to be instance of HTMLElement"
      );
    }

    var subtitlesElement = document.createElement("div");
    subtitlesElement.style.position = "absolute";
    subtitlesElement.style.right = "0";
    subtitlesElement.style.bottom = "0";
    // subtitlesElement.style.top = "0";
    subtitlesElement.style.left = "0";
    subtitlesElement.style.zIndex = "1";
    subtitlesElement.style.textAlign = "center";
    containerElement.style.position = "relative";
    containerElement.style.zIndex = "0";
    // subtitlesElement.style.height = "100%";
    containerElement.appendChild(subtitlesElement);

    var videoState = {
      time: null,
    };
    var cuesByTime = null;
    var cuesByTime2 = null;
    var events = new EventEmitter();
    var destroyed = false;
    var tracks = [];
    var selectedTrackId = null;
    var selectedSub2TrackId = null;
    var delay = null;
    var delay2 = 0;
    var size = 100;
    var offset = 0;
    var textColor = "rgb(255, 255, 255)";
    var backgroundColor = "rgba(0, 0, 0, 0)";
    var outlineColor = "rgb(34, 34, 34)";
    var observedProps = {
      extraSubtitlesTracks: false,
      selectedExtraSubtitlesTrackId: false,
      selectedExtraSubtitles2TrackId: false,
      extraSubtitlesDelay: false,
      extraSubtitles2Delay: false,
      extraSubtitlesSize: false,
      extraSubtitles2Size: false,
      extraSubtitlesOffset: false,
      extraSubtitlesTextColor: false,
      extraSubtitlesBackgroundColor: false,
      extraSubtitlesOutlineColor: false,
    };

    function renderSubtitles() {
      while (subtitlesElement.hasChildNodes()) {
        subtitlesElement.removeChild(subtitlesElement.lastChild);
      }
      const heightC = "5.625rem";
      const subDiv1 = document.createElement("div");
      subDiv1.style.width = "100%";
      subDiv1.style.height = heightC;

      const subDiv2 = document.createElement("div");
      subDiv2.style.width = "100%";
      subDiv2.style.height = heightC;

      subtitlesElement.appendChild(subDiv1);
      subtitlesElement.appendChild(subDiv2);
      subtitlesElement.style.bottom = offset + "%";

      function renderSub1() {
        const node = [];
        if (
          cuesByTime === null ||
          videoState.time === null ||
          !isFinite(videoState.time)
        ) {
          return node;
        }
        subtitlesRenderer
          .render(cuesByTime, videoState.time + delay)
          .forEach(function (cueNode) {
            cueNode.style.id = "subtitle1";
            cueNode.style.display = "inline-block";
            cueNode.style.padding = "0.2em";
            cueNode.style.fontSize =
              Math.floor(size / 25) * (window.innerHeight / 100) + "px";
            cueNode.style.fontWeight = "700";
            cueNode.style.color = textColor;
            cueNode.style.backgroundColor = backgroundColor;
            cueNode.style.textShadow = "1px 1px 0.1em " + outlineColor;
            cueNode.style.whiteSpace = "nowrap";
            node.push(cueNode);
          });
        return node;
      }
      function renderSub2() {
        const node = [];
        if (
          cuesByTime2 === null ||
          videoState.time === null ||
          !isFinite(videoState.time)
        ) {
          return node;
        }
        subtitlesRenderer
          .render(cuesByTime2, videoState.time + delay2)
          .forEach(function (cueNode) {
            cueNode.style.display = "inline-block";
            cueNode.id = "subtitle2";
            cueNode.style.padding = "0.2em";
            cueNode.style.fontSize =
              Math.floor(size / 25) * (window.innerHeight / 100) + "px";
            cueNode.style.color = textColor;
            cueNode.style.backgroundColor = backgroundColor;
            cueNode.style.textShadow = "1px 1px 0.1em " + outlineColor;
            cueNode.style.whiteSpace = "nowrap";
            node.push(cueNode);
          });
        return node;
      }
      const node1 = renderSub1();
      const node2 = renderSub2();
      for (const cueNode of node1) {
        subDiv1.appendChild(cueNode);
        while (cueNode.offsetWidth > subDiv1.offsetWidth) {
          const fontSize = parseFloat(
            window.getComputedStyle(cueNode, null).getPropertyValue("font-size")
          );
          cueNode.style.fontSize = fontSize - 1 + "px";
        }
      }
      for (const cueNode of node2) {
        subDiv2.appendChild(cueNode);
        while (cueNode.offsetWidth > subDiv2.offsetWidth) {
          const fontSize = parseFloat(
            window.getComputedStyle(cueNode, null).getPropertyValue("font-size")
          );
          cueNode.style.fontSize = fontSize - 1 + "px";
        }
      }
    }
    function onVideoError(error) {
      events.emit("error", error);
      if (error.critical) {
        command("unload");
      }
    }
    function onVideoPropEvent(eventName, propName, propValue) {
      switch (propName) {
        case "time": {
          videoState.time = propValue;
          renderSubtitles();
          break;
        }
      }

      events.emit(eventName, propName, getProp(propName, propValue));
    }
    function onOtherVideoEvent(eventName) {
      return function () {
        events.emit.apply(events, [eventName].concat(Array.from(arguments)));
      };
    }
    function onPropChanged(propName) {
      if (observedProps[propName]) {
        events.emit("propChanged", propName, getProp(propName, null));
      }
    }
    function onError(error) {
      events.emit("error", error);
      if (error.critical) {
        command("unload");
        video.dispatch({ type: "command", commandName: "unload" });
      }
    }
    function getProp(propName, videoPropValue) {
      switch (propName) {
        case "extraSubtitlesTracks": {
          if (destroyed) {
            return [];
          }

          return tracks.slice();
        }
        case "selectedExtraSubtitlesTrackId": {
          if (destroyed) {
            return null;
          }

          return selectedTrackId;
        }
        case "selectedExtraSubtitles2TrackId": {
          if (destroyed) {
            return null;
          }

          return selectedSub2TrackId;
        }
        case "extraSubtitlesDelay": {
          if (destroyed) {
            return null;
          }

          return delay;
        }
        case "extraSubtitles2Delay": {
          if (destroyed) {
            return null;
          }

          return delay2;
        }
        case "extraSubtitlesSize": {
          if (destroyed) {
            return null;
          }

          return size;
        }

        case "extraSubtitles2Size": {
          if (destroyed) {
            return null;
          }

          return size;
        }
        case "extraSubtitlesOffset": {
          if (destroyed) {
            return null;
          }

          return offset;
        }
        case "extraSubtitlesTextColor": {
          if (destroyed) {
            return null;
          }

          return textColor;
        }
        case "extraSubtitlesBackgroundColor": {
          if (destroyed) {
            return null;
          }

          return backgroundColor;
        }
        case "extraSubtitlesOutlineColor": {
          if (destroyed) {
            return null;
          }

          return outlineColor;
        }
        default: {
          return videoPropValue;
        }
      }
    }
    function observeProp(propName) {
      switch (propName) {
        case "extraSubtitlesTracks":
        case "selectedExtraSubtitlesTrackId":
        case "selectedExtraSubtitles2TrackId":
        case "extraSubtitlesDelay":
        case "extraSubtitles2Delay":
        case "extraSubtitlesSize":
        case "extraSubtitles2Size":
        case "extraSubtitlesOffset":
        case "extraSubtitlesTextColor":
        case "extraSubtitlesBackgroundColor":
        case "extraSubtitlesOutlineColor": {
          events.emit("propValue", propName, getProp(propName, null));
          observedProps[propName] = true;
          return true;
        }
        default: {
          return false;
        }
      }
    }
    function setProp(propName, propValue) {
      switch (propName) {
        case "selectedExtraSubtitlesTrackId": {
          cuesByTime = null;
          selectedTrackId = null;
          delay = null;
          if (!propValue) propName = "";
          const [trackId, subId] = propValue.split(";") || "";
          const selectedTrack = tracks.find(function (track) {
            return track.id === trackId;
          });
          if (selectedTrack) {
            selectedTrackId = selectedTrack.id;
            delay = 0;
            fetch(selectedTrack.url)
              .then(function (resp) {
                if (resp.ok) {
                  return resp.text();
                }

                throw new Error(resp.status + " (" + resp.statusText + ")");
              })
              .then(function (text) {
                return subtitlesConverter.convert(text);
              })
              .then(function (text) {
                return subtitlesParser.parse(text);
              })
              .then(function (result) {
                if (selectedTrackId !== selectedTrack.id) {
                  return;
                }

                cuesByTime = result;
                renderSubtitles();
                events.emit("extraSubtitlesTrackLoaded", selectedTrack);
              })
              .catch(function (error) {
                if (selectedTrackId !== selectedTrack.id) {
                  return;
                }

                onError(
                  Object.assign({}, ERROR.WITH_HTML_SUBTITLES.LOAD_FAILED, {
                    error: error,
                    track: selectedTrack,
                    critical: false,
                  })
                );
              });
          }
          renderSubtitles();
          onPropChanged("selectedExtraSubtitlesTrackId");
          onPropChanged("extraSubtitlesDelay");
          return true;
        }
        case "selectedExtraSubtitles2TrackId": {
          cuesByTime2 = null;
          selectedSub2TrackId = null;
          delay2 = 0;
          const [trackId, subId] = propValue.split(";") || "";
          const selectedTrack = tracks.find(function (track) {
            return track.id === trackId;
          });

          if (selectedTrack) {
            selectedSub2TrackId = selectedTrack.id;
            delay2 = 0;
            fetch(selectedTrack.url)
              .then(function (resp) {
                if (resp.ok) {
                  return resp.text();
                }

                throw new Error(resp.status + " (" + resp.statusText + ")");
              })
              .then(function (text) {
                return subtitlesConverter.convert(text);
              })
              .then(function (text) {
                return subtitlesParser.parse(text);
              })
              .then(function (result) {
                if (selectedSub2TrackId !== selectedTrack.id) {
                  return;
                }

                cuesByTime2 = result;
                renderSubtitles();
                events.emit("extraSubtitlesTrackLoaded", selectedTrack);
              })
              .catch(function (error) {
                if (selectedSub2TrackId !== selectedTrack.id) {
                  return;
                }

                onError(
                  Object.assign({}, ERROR.WITH_HTML_SUBTITLES.LOAD_FAILED, {
                    error: error,
                    track: selectedTrack,
                    critical: false,
                  })
                );
              });
          }
          renderSubtitles();
          onPropChanged("selectedExtraSubtitles2TrackId");
          onPropChanged("extraSubtitles2Delay");
          return true;
        }
        case "extraSubtitlesDelay": {
          if (
            selectedTrackId !== null &&
            propValue !== null &&
            isFinite(propValue)
          ) {
            delay = parseInt(propValue, 10);
            renderSubtitles();
            onPropChanged("extraSubtitlesDelay");
          }

          return true;
        }
        case "extraSubtitles2Delay": {
          if (
            selectedSub2TrackId !== null &&
            propValue !== null &&
            isFinite(propValue)
          ) {
            delay2 = parseInt(propValue, 10);
            renderSubtitles();
            onPropChanged("extraSubtitles2Delay");
          }

          return true;
        }
        case "extraSubtitlesSize": {
          if (propValue !== null && isFinite(propValue)) {
            size = Math.max(0, parseInt(propValue, 10));
            renderSubtitles();
            onPropChanged("extraSubtitlesSize");
          }

          return true;
        }
        case "extraSubtitles2Size": {
          if (propValue !== null && isFinite(propValue)) {
            size = Math.max(0, parseInt(propValue, 10));
            renderSubtitles();
            onPropChanged("extraSubtitles2Size");
          }

          return true;
        }
        case "extraSubtitlesOffset": {
          if (propValue !== null && isFinite(propValue)) {
            offset = Math.max(0, Math.min(100, parseInt(propValue, 10)));
            renderSubtitles();
            onPropChanged("extraSubtitlesOffset");
          }

          return true;
        }
        case "extraSubtitlesTextColor": {
          if (typeof propValue === "string") {
            try {
              textColor = Color(propValue).rgb().string();
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error("withHTMLSubtitles", error);
            }

            renderSubtitles();
            onPropChanged("extraSubtitlesTextColor");
          }

          return true;
        }
        case "extraSubtitlesBackgroundColor": {
          if (typeof propValue === "string") {
            try {
              backgroundColor = Color(propValue).rgb().string();
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error("withHTMLSubtitles", error);
            }

            renderSubtitles();
            onPropChanged("extraSubtitlesBackgroundColor");
          }

          return true;
        }
        case "extraSubtitlesOutlineColor": {
          if (typeof propValue === "string") {
            try {
              outlineColor = Color(propValue).rgb().string();
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error("withHTMLSubtitles", error);
            }

            renderSubtitles();
            onPropChanged("extraSubtitlesOutlineColor");
          }

          return true;
        }
        default: {
          return false;
        }
      }
    }
    function command(commandName, commandArgs) {
      switch (commandName) {
        case "addExtraSubtitlesTracks": {
          if (commandArgs && Array.isArray(commandArgs.tracks)) {
            tracks = tracks
              .concat(commandArgs.tracks)
              .filter(function (track, index, tracks) {
                return (
                  track &&
                  typeof track.id === "string" &&
                  typeof track.url === "string" &&
                  typeof track.lang === "string" &&
                  typeof track.label === "string" &&
                  typeof track.origin === "string" &&
                  !track.embedded &&
                  index ===
                    tracks.findIndex(function (t) {
                      return t.id === track.id;
                    })
                );
              });
            onPropChanged("extraSubtitlesTracks");
          }

          return true;
        }
        case "load": {
          command("unload");
          if (
            commandArgs.stream &&
            Array.isArray(commandArgs.stream.subtitles)
          ) {
            command("addExtraSubtitlesTracks", {
              tracks: commandArgs.stream.subtitles.map(function (track) {
                return Object.assign({}, track, {
                  origin: "EXCLUSIVE",
                  exclusive: true,
                  embedded: false,
                });
              }),
            });
          }

          return false;
        }
        case "unload": {
          cuesByTime = null;
          tracks = [];
          selectedTrackId = null;
          selectedSub2TrackId = null;
          delay = null;
          delay2 = null;
          renderSubtitles();
          onPropChanged("extraSubtitlesTracks");
          onPropChanged("selectedExtraSubtitlesTrackId");
          onPropChanged("selectedExtraSubtitles2TrackId");
          onPropChanged("extraSubtitlesDelay");
          onPropChanged("extraSubtitles2Delay");
          return false;
        }
        case "destroy": {
          command("unload");
          destroyed = true;
          onPropChanged("extraSubtitlesSize");
          onPropChanged("extraSubtitles2Size");
          onPropChanged("extraSubtitlesOffset");
          onPropChanged("extraSubtitlesTextColor");
          onPropChanged("extraSubtitlesBackgroundColor");
          onPropChanged("extraSubtitlesOutlineColor");
          video.dispatch({ type: "command", commandName: "destroy" });
          events.removeAllListeners();
          containerElement.removeChild(subtitlesElement);
          return true;
        }
        default: {
          return false;
        }
      }
    }

    this.on = function (eventName, listener) {
      if (destroyed) {
        throw new Error("Video is destroyed");
      }

      events.on(eventName, listener);
    };
    this.dispatch = function (action) {
      if (destroyed) {
        throw new Error("Video is destroyed");
      }

      if (action) {
        action = deepFreeze(cloneDeep(action));
        switch (action.type) {
          case "observeProp": {
            if (observeProp(action.propName)) {
              return;
            }

            break;
          }
          case "setProp": {
            if (setProp(action.propName, action.propValue)) {
              return;
            }

            break;
          }
          case "command": {
            if (command(action.commandName, action.commandArgs)) {
              return;
            }

            break;
          }
        }
      }

      video.dispatch(action);
    };
  }

  VideoWithHTMLSubtitles.canPlayStream = function (stream) {
    return Video.canPlayStream(stream);
  };

  VideoWithHTMLSubtitles.manifest = {
    name: Video.manifest.name + "WithHTMLSubtitles",
    external: Video.manifest.external,
    props: Video.manifest.props
      .concat([
        "extraSubtitlesTracks",
        "selectedExtraSubtitlesTrackId",
        "selectedExtraSubtitles2TrackId",
        "extraSubtitlesDelay",
        "extraSubtitles2Delay",
        "extraSubtitlesSize",
        "extraSubtitles2Size",
        "extraSubtitlesOffset",
        "extraSubtitlesTextColor",
        "extraSubtitlesBackgroundColor",
        "extraSubtitlesOutlineColor",
      ])
      .filter(function (value, index, array) {
        return array.indexOf(value) === index;
      }),
    commands: Video.manifest.commands
      .concat(["load", "unload", "destroy", "addExtraSubtitlesTracks"])
      .filter(function (value, index, array) {
        return array.indexOf(value) === index;
      }),
    events: Video.manifest.events
      .concat([
        "propValue",
        "propChanged",
        "error",
        "extraSubtitlesTrackLoaded",
      ])
      .filter(function (value, index, array) {
        return array.indexOf(value) === index;
      }),
  };

  return VideoWithHTMLSubtitles;
}

module.exports = withHTMLSubtitles;
