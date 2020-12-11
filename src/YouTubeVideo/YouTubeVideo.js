var EventEmitter = require('events');
var cloneDeep = require('lodash.clonedeep');
var ERROR = require('../error');

function YouTubeVideo(options) {
    options = options || {};

    var timeChangedTimeout = !isNaN(options.timeChangedTimeout) ? parseInt(options.timeChangedTimeout, 10) : 100;
    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var apiScriptElement = document.createElement('script');
    apiScriptElement.type = 'text/javascript';
    apiScriptElement.src = 'https://www.youtube.com/iframe_api';
    apiScriptElement.onload = onAPILoaded;
    apiScriptElement.onerror = onAPIError;
    containerElement.appendChild(apiScriptElement);

    var videoContainerElement = document.createElement('div');
    videoContainerElement.style.width = '100%';
    videoContainerElement.style.height = '100%';
    videoContainerElement.style.backgroundColor = 'black';
    containerElement.appendChild(videoContainerElement);

    var events = new EventEmitter();
    events.on('error', function() { });

    var destroyed = false;
    var ready = false;
    var stream = null;
    var video = null;
    var pendingLoadArgs = null;
    var selectedSubtitlesTrackId = null;
    var observedProps = {
        stream: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        volume: false,
        muted: false,
        subtitlesTracks: false,
        selectedSubtitlesTrackId: false
    };

    var timeChangedIntervalId = window.setInterval(function() {
        onPropChanged('time');
    }, timeChangedTimeout);

    function onAPIError() {
        onError(Object.extend({}, ERROR.YOUTUBE_VIDEO.API_LOAD_FAILED, {
            critical: true
        }));
    }
    function onAPILoaded() {
        if (destroyed) {
            return;
        }

        if (!YT) {
            onAPIError();
            return;
        }

        YT.ready(function() {
            if (destroyed) {
                return;
            }

            video = new YT.Player(videoContainerElement, {
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 1,
                    cc_load_policy: 3,
                    controls: 0,
                    disablekb: 1,
                    enablejsapi: 1,
                    fs: 0,
                    iv_load_policy: 3,
                    loop: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    rel: 0
                },
                events: {
                    onError: onVideoError,
                    onReady: onVideoReady,
                    onStateChange: onVideoStateChange,
                    onApiChange: onVideoAPIChange
                }
            });
        });
    }
    function onVideoError(videoError) {
        var error;
        switch (videoError.data) {
            case 2: {
                error = ERROR.YOUTUBE_VIDEO.INVALID_PARAMETER;
                break;
            }
            case 5: {
                error = ERROR.YOUTUBE_VIDEO.HTML5_VIDEO;
                break;
            }
            case 100: {
                error = ERROR.YOUTUBE_VIDEO.VIDEO_NOT_FOUND;
                break;
            }
            case 101:
            case 150: {
                error = ERROR.YOUTUBE_VIDEO.VIDEO_NOT_EMBEDDABLE;
                break;
            }
            default: {
                error = ERROR.UNKNOWN_ERROR;
            }
        }
        onError(Object.extend({}, error, {
            critical: true,
            error: videoError
        }));
    }
    function onVideoReady() {
        ready = true;
        if (pendingLoadArgs !== null) {
            command('load', pendingLoadArgs);
            pendingLoadArgs = null;
        }
    }
    function onVideoStateChange(state) {
        onPropChanged('buffering');
        switch (state.data) {
            case YT.PlayerState.ENDED: {
                onEnded();
                break;
            }
            case YT.PlayerState.CUED:
            case YT.PlayerState.UNSTARTED:
            case YT.PlayerState.PAUSED:
            case YT.PlayerState.PLAYING: {
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                break;
            }
        }
    }
    function onVideoAPIChange() {
        video.loadModule('captions');
        onPropChanged('paused');
        onPropChanged('time');
        onPropChanged('duration');
        onPropChanged('buffering');
        onPropChanged('volume');
        onPropChanged('muted');
        onPropChanged('subtitlesTracks');
        onPropChanged('selectedSubtitlesTrackId');
    }
    function getProp(propName) {
        switch (propName) {
            case 'stream': {
                return stream;
            }
            case 'paused': {
                if (stream === null || typeof video.getPlayerState !== 'function') {
                    return null;
                }

                return video.getPlayerState() !== YT.PlayerState.PLAYING;
            }
            case 'time': {
                if (stream === null || typeof video.getCurrentTime !== 'function' || video.getCurrentTime() === null || !isFinite(video.getCurrentTime())) {
                    return null;
                }

                return Math.floor(video.getCurrentTime() * 1000);
            }
            case 'duration': {
                if (stream === null || typeof video.getDuration !== 'function' || video.getDuration() === null || !isFinite(video.getDuration())) {
                    return null;
                }

                return Math.floor(video.getDuration() * 1000);
            }
            case 'buffering': {
                if (stream === null || typeof video.getPlayerState !== 'function') {
                    return null;
                }

                return video.getPlayerState() === YT.PlayerState.BUFFERING;
            }
            case 'volume': {
                if (stream === null || typeof video.getVolume !== 'function' || video.getVolume() === null || !isFinite(video.getVolume())) {
                    return null;
                }

                return video.getVolume();
            }
            case 'muted': {
                if (stream === null || typeof video.isMuted !== 'function') {
                    return null;
                }

                return video.isMuted();
            }
            case 'subtitlesTracks': {
                if (stream === null) {
                    return null;
                }

                return (video.getOption('captions', 'tracklist') || [])
                    .filter(function(track) {
                        return track && typeof track.languageCode === 'string';
                    })
                    .map(function(track, index) {
                        return Object.freeze({
                            id: String(index),
                            lang: track.languageCode
                        });
                    });
            }
            case 'selectedSubtitlesTrackId': {
                if (stream === null) {
                    return null;
                }

                return selectedSubtitlesTrackId;
            }
        }
    }
    function onError(error) {
        events.emit('error', error);
        if (error.critical) {
            command('unload');
        }
    }
    function onEnded() {
        events.emit('ended');
    }
    function onPropChanged(propName) {
        if (observedProps[propName]) {
            events.emit('propChanged', propName, getProp(propName));
        }
    }
    function observeProp(propName) {
        if (observedProps.hasOwnProperty(propName)) {
            events.emit('propValue', propName, getProp(propName));
            observedProps[propName] = true;
        }
    }
    function setProp(propName, propValue) {
        switch (propName) {
            case 'paused': {
                if (stream !== null) {
                    propValue ?
                        typeof video.pauseVideo === 'function' && video.pauseVideo()
                        :
                        typeof video.playVideo === 'function' && video.playVideo();
                }

                break;
            }
            case 'time': {
                if (stream !== null && typeof video.seekTo === 'function' && propValue !== null && isFinite(propValue)) {
                    video.seekTo(parseInt(propValue, 10) / 1000);
                }

                break;
            }
            case 'volume': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    if (typeof video.unMute === 'function') {
                        video.unMute();
                    }
                    if (typeof video.setVolume === 'function') {
                        video.setVolume(Math.max(0, Math.min(100, parseInt(propValue, 10))));
                    }
                    onPropChanged('muted');
                    onPropChanged('volume');
                }

                break;
            }
            case 'muted': {
                if (stream !== null) {
                    propValue ?
                        typeof video.mute === 'function' && video.mute()
                        :
                        typeof video.unMute === 'function' && video.unMute();
                    onPropChanged('muted');
                }

                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    selectedSubtitlesTrackId = null;
                    var selecterdTrack = getProp('subtitlesTracks')
                        .find(function(track) {
                            return track.id === propValue;
                        });
                    if (selecterdTrack) {
                        selectedSubtitlesTrackId = selecterdTrack.id;
                        video.setOption('captions', 'track', {
                            languageCode: selecterdTrack.lang
                        });
                        events.emit('subtitlesTrackLoaded', selecterdTrack);
                    }
                    onPropChanged('selectedSubtitlesTrackId');
                }

                break;
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                if (ready) {
                    command('unload');
                    if (commandArgs && commandArgs.stream && typeof commandArgs.stream.ytId === 'string') {
                        stream = commandArgs.stream;
                        onPropChanged('stream');
                        var autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
                        var time = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) / 1000 : 0;
                        if (autoplay) {
                            video.loadVideoById({
                                videoId: commandArgs.stream.ytId,
                                startSeconds: time
                            });
                        } else {
                            video.cueVideoById({
                                videoId: commandArgs.stream.ytId,
                                startSeconds: time
                            });
                        }
                        onPropChanged('paused');
                        onPropChanged('time');
                        onPropChanged('duration');
                        onPropChanged('buffering');
                        onPropChanged('volume');
                        onPropChanged('muted');
                        onPropChanged('subtitlesTracks');
                        onPropChanged('selectedSubtitlesTrackId');
                    } else {
                        onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                            critical: true,
                            stream: commandArgs ? commandArgs.stream : null
                        }));
                    }
                } else {
                    pendingLoadArgs = commandArgs;
                }

                break;
            }
            case 'unload': {
                stream = null;
                onPropChanged('stream');
                selectedSubtitlesTrackId = null;
                if (ready) {
                    video.stopVideo();
                }
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                onPropChanged('volume');
                onPropChanged('muted');
                onPropChanged('subtitlesTracks');
                onPropChanged('selectedSubtitlesTrackId');
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                events.removeAllListeners();
                events.on('error', function() { });
                clearInterval(timeChangedIntervalId);
                if (ready) {
                    video.destroy();
                }
                containerElement.removeChild(apiScriptElement);
                containerElement.removeChild(videoContainerElement);
                break;
            }
        }
    }

    this.on = function(eventName, listener) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        events.on(eventName, listener);
    };
    this.dispatch = function(action) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        action = cloneDeep(action);
        if (action) {
            switch (action.type) {
                case 'observeProp': {
                    observeProp(action.propName);
                    return;
                }
                case 'setProp': {
                    setProp(action.propName, action.propValue);
                    return;
                }
                case 'command': {
                    command(action.commandName, action.commandArgs);
                    return;
                }
            }
        }

        throw new Error('Invalid action dispatched: ' + JSON.stringify(action));
    };
}

YouTubeVideo.canPlayStream = function(stream) {
    return Promise.resolve(stream && typeof stream.ytId === 'string');
};

YouTubeVideo.manifest = {
    name: 'YouTubeVideo',
    props: ['stream', 'paused', 'time', 'duration', 'buffering', 'volume', 'muted', 'subtitlesTracks', 'selectedSubtitlesTrackId'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propChanged', 'propValue', 'ended', 'error', 'subtitlesTrackLoaded']
};

module.exports = YouTubeVideo;
