if (!String.prototype.endsWith) {
    String.prototype.endsWith = function(searchString, position) {
        var subjectString = this.toString();
        if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        var lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    };
}

var fs = require("fs");
var path = require("path");

const async = require("async");
var walk = require('walk');
const _ = require("lodash");

var reAsset = new RegExp("Assets\\" + path.sep + "\\w+\\.(?:imageset|appiconset|launchimage)\\" + path.sep);
var _contentsJSONCache = {};
var androidImageNameChecker = require("smartface-cli-common-utils").androidImageNameChecker;
var md5File = require("./managefiles").md5.file;
var globalOptions = null;
/*
 * RAU Project Index
 * @typedef {Object} Index
 * @property {**************
 */

/**
 * @callback GetIndexCallback
 * @param {Index} data - Device index provided as data property of the callback
 */

/**
 * Calculates index from workspace
 * @param {Device} device - Required. Device information to get correct image resources
 * @param {GetIndexCallback} - Required. When provided performs asynch operation
 */
function getIndex(device, callback) {
    //var projectJSON = fs.readFileSync(this.projectJSONPath, "utf8");
    //projectJSON = JSON.parse(projectJSON);
    var _contentsJSONCache = {}; //needs reset

    var me = this;
    var taskCount = 3;
    var index = {
        files: {}
    };
    var errors = [];
    walkFolder(this.assetsPath, function walk_callback_assets(files) {
        processFolder(index, files, "asset", done, globalOptions);
    });

    walkFolder(this.scriptsPath, function walk_callback_scripts(files) {
        processFolder(index, files, "script", done, globalOptions);
    });
/*
    fs.stat(this.fontConfigPath, function(err, stat) {
        if (err) {
            console.log("There is an error while processing FontConfig.xml file");
            return;
        }
        fs.readFile(me.fontConfigPath, "utf8", function fileContentFontConfigXML(err, data) {
            if (err)
                throw err;
            var doc = new DOMParser().parseFromString(data);
            var query = "/Fonts/Font/@Name";
            if (device.os === "Android")
                query = "/Fonts/Font/@Name[../@AndroidPublish = 'Y']";
            else if (device.os === "iOS") {
                query = "/Fonts/Font/@Name[../@iOSPublish = 'Y']";
            }
            var nodes = xpath.select(query, doc);
            nodes.forEach(function(element, idx, array) {
                var regexSpace = / /g;
                var fontName = element.value.replace(regexSpace, ".");
                taskCount++;
                var fontFolder = path.join(path.dirname(me.fontConfigPath), "Fonts", fontName);
                walkFolder(fontFolder, function walk_callback_fonts(files) {
                    processFolder(index, files, "font", done, globalOptions);
                });
            });
            done();
        });
    });
    
    */

    var otherMapping = [{
        path: path.join(this.configPath, "defaults.xml"),
        scheme: "config",
        relativeTo: this.configPath
    }];

    function handleOther() {
        var handled = [];
        var mapping;
        for (var i = 0; i < otherMapping.length; i++) {
            mapping = otherMapping[i];
            if (mapping.os && (mapping.os !== device.os)) {
                handled.push(i);
                continue;
            }
            fs.stat(mapping.path, function otherStatCallback(err, stats) {
                if (err)
                    return;
                taskCount++;
                var fileObject = {};
                fileObject[mapping.path] = path.relative(mapping.relativeTo, mapping.path);
                processFolder(index, fileObject, mapping.scheme, done, globalOptions);
            });
        }
    }
    handleOther();

    function handleImages() {
        if (globalOptions && globalOptions.rau === true) {
            taskCount++;
            handleImages_Android();
            handleImages_iOS();
        }
        else if (device.os === "iOS") {
            handleImages_iOS();
        }
        else if (device.os === "Android") {
            handleImages_Android();
        }
    }
    handleImages();

    function handleImages_iOS() {
        var order = [2, 3, 1];

        var iOSImagesFolder = path.join(me.imagesPath, "iOS");
        walkFolder(iOSImagesFolder, function walk_callback_iOSImages(files) {
            var filesArray = Object.keys(files);
            var images = {};
            var newFiles = {};
            filesArray.forEach(function(element, idx, array) {
                var fileInfo = path.parse(element);
                if (fileInfo.base === "Contents.json")
                    return; //skip Contents.json
                var imgInfo = getiOSImageInfo(element);
                imgInfo.fullPath = element;
                imgInfo.priority = order.indexOf(imgInfo.multiplier);

                if (!images[imgInfo.name])
                    images[imgInfo.name] = imgInfo;
                else {
                    var other = images[imgInfo.name];
                    if (other.priority > imgInfo.priority)
                        images[imgInfo.name] = imgInfo;
                }
            });
            for (var imgInfoName in images) {
                newFiles[images[imgInfoName].fullPath] = files[images[imgInfoName].fullPath];
            }

            Object.defineProperty(newFiles, "__ofBaseFolder", {
                enumerable: false,
                configurable: true,
                value: files.__ofBaseFolder
            });

            processFolder(index, newFiles, "image", done, _.extend({}, {
                os: "iOS"
            }, globalOptions));
        });
    }

    function getiOSImageInfo(name) {
        var fileInfo = path.parse(name);
        var imgName = fileInfo.name;
        var multiplier = 1;
        reAsset.lastIndex = 0; //requires reset before any reuse
        if (reAsset.test(name)) { //is an asset image
            var contents = getContentsJSON(name);
            var imageRecord;
            var assetName = path.parse(path.dirname(name)).name;

            for (var i = 0; i < contents.images.length; i++) {
                imageRecord = contents.images[i];
                if (imageRecord.filename === fileInfo.base) {
                    multiplier = Number(imageRecord.scale[0]);
                    var ret = {
                        multiplier: multiplier,
                        name: assetName,
                        assetName: assetName
                    };
                    return ret;
                }
            }
            return {
                name: "",
                multiplier: Number.MIN_VALUE
            }
        }
        else { //is not an asset image
            if (imgName.endsWith("@2x"))
                multiplier = 2;
            else if (imgName.endsWith("@3x"))
                multiplier = 3;
            switch (multiplier) {
                case 1:
                    return {
                        name: imgName,
                        multiplier: 1
                    };
                case 2:
                case 3:
                    return {
                        name: imgName.substr(0, name.length - 3),
                        multiplier: multiplier
                    };
                default:
                    throw Error("unhandeled image naming for iOS");
            }
        }
    }

    function getContentsJSON(name) {
        var contentsJSONPath = path.join(path.dirname(name), "Contents.json");
        if (!_contentsJSONCache[contentsJSONPath]) {
            _contentsJSONCache[contentsJSONPath] = JSON.parse(
                fs.readFileSync(contentsJSONPath, "utf8"));
        }
        return _contentsJSONCache[contentsJSONPath];
    }

    function handleImages_Android() {
        var androidImagesFolder = path.join(me.imagesPath, "Android");
        walkFolder(androidImagesFolder, function walk_callback_AndroidImages(files) {
            var filesArray = Object.keys(files).filter(function(value) {
                return path.relative(androidImagesFolder, value).split(path.sep).length === 2;
            }, filesArray);
            var images = {};
            var newFiles = {};
            filesArray.forEach(function(element, idx, array) {
                var imgInfo = getAndroidImageInfo(element);
                imgInfo.fullPath = element;

                if (!images[imgInfo.fullPath])
                    images[imgInfo.fullPath] = imgInfo;
                else {
                    /*
                    var other = images[imgInfo.name];
                    if (other.priority > imgInfo.priority)
                        images[imgInfo.name] = imgInfo;
                    */
                }
            });
            for (var imgInfo in images) {
                newFiles[images[imgInfo].fullPath] = path.parse(files[images[imgInfo].fullPath]).base;
            }
            Object.defineProperty(newFiles, "__ofBaseFolder", {
                enumerable: false,
                configurable: true,
                value: files.__ofBaseFolder
            });

            processFolder(index, newFiles, "image", done, _.extend({}, {
                os: "Android",
            }, globalOptions));
        });
    }

    function getAndroidImageInfo(fullPath) {
        var fileInfo = path.parse(fullPath);
        var density = path.parse(path.dirname(fullPath)).name;
        var priority = -1; //device.resourceFolderOrder.indexOf(density);
        var validImageName = androidImageNameChecker.imageNameCheck(fileInfo.base);
        if (!validImageName) {
            errors.push({
                type: "invalid file name",
                details: {
                    fullPath: fullPath,
                    name: fileInfo.base
                }
            });
        }
        return {
            name: fileInfo.name,
            density: density,
            fullPath: fullPath,
            priority: priority === -1 ? Number.MAX_VALUE : priority
        };
    }

    function done() {
        taskCount--;
        if (taskCount !== 0)
            return;
        index = injectErrors(index, errors);
        index = sort(index);
        callback(index);
    }
}

function sort(obj) {
    if (typeof obj !== "object")
        return obj;
    var props = Object.keys(obj).sort();
    var newObject = obj instanceof Array ? [] : {};
    var i, p;
    for (i = 0; i < props.length; i++) {
        p = props[i];
        newObject[p] = sort(obj[p]);
    }
    if (props.length === 0)
        return obj;
    return newObject;
}

function walkFolder(folder, callback) {
    var files = {};
    Object.defineProperty(files, "__ofBaseFolder", {
        enumerable: false,
        configurable: true,
        value: folder
    });

    var walker = walk.walk(folder, {
        followLinks: false
    });
    walker.name = folder;
    walker.on("file", fileHandler);
    walker.on("end", endHandler);

    function fileHandler(root, fileStat, next) {
        var fullPath = path.join(root, fileStat.name);
        var relativePath = path.relative(folder, fullPath);
        relativePath = relativePath.split(path.sep).join("/");
        files[fullPath] = relativePath;
        if (typeof next === "function")
            next();
    }

    function endHandler() {
        callback(files);
    }
}

function processFolder(index, files, schema, callback, options) {
    options = options || {};
    index = index || {};
    index.files = index.files || {};
    var me = this,
        filesArray = Object.keys(files);

    if (filesArray.length === 0) {
        return finalize();
    }

    // create a queue object with concurrency 20
    var q = async.queue(function(file, callback) {
        if (options.rau && options.rau === true) {
            getOS(file);
            getPath(file);
        }
        Promise.all([
            getFileStats(file),
            getHash(file)
        ]).then(res => {
            callback();
        }, callback);
    }, 20);

    // assign a callback
    q.drain = function() {
        finalize();
    };
    
    q.push(filesArray);

    function finalize() {
        callback.call(me, index);
    }

    function getFileStats(file) {
        return new Promise((resolve, reject) => {
            fs.stat(file, function fStat(err, stats) {
                if (err) {
                    return reject(err);
                }
                var uri = getURI(file);
                index.files[uri] = index.files[uri] || {};
                //index.files[uri].date = stats.ctime;
                resolve(uri);
            });
        });
    }

    function getHash(file) {
        return md5File(file).then(hash => {
            var uri = getURI(file);
            index.files[uri] = index.files[uri] || {};
            index.files[uri].hash = hash;
            return hash;
        }, err => {
            throw err;
        });
    }

    function getOS(file) {
        var uri = getURI(file);
        index.files[uri] = index.files[uri] || {};
        index.files[uri].OS = _getOs();

        function _getOs() {
            var res = [];
            if (options.os) {
                res.push(options.os);
            }
            else {
                res.push("iOS");
                res.push("Android");
            }
            return res;
        }
    }

    function getPath(file) {
        var uri = getURI(file);
        index.files[uri] = index.files[uri] || {};
        var _path = path.relative(options.path, file);
        if (["image", "script", "assets"].indexOf(schema) === -1) {
            if (schema === "config") {
                _path = path.join("config", path.basename(_path));
            }
            else if (schema === "font") {
                _path = path.join("fonts", path.basename(_path));
            }
        }
        index.files[uri].path = _path;
    }

    function getURI(file) {
        reAsset.lastIndex = 0;
        if (options.os === "Android") {
            var density = path.parse(path.dirname(file)).name;
            return schema + "://" + files[file] + "?density=" + density;
        }
        else if (options.os === "iOS") {
            if (schema === "image" && reAsset.test(files[file])) {
                var fileInfo = path.parse(files[file]);
                var assetInfo = path.parse(fileInfo.dir);
                var contentJSONImages = _contentsJSONCache[path.join(path.dirname(file), "Contents.json")].images;
                for (var i = 0; i < contentJSONImages.length; i++) {
                    if (contentJSONImages[i].filename === fileInfo.base) {
                        return schema + "://" + assetInfo.name +
                            (contentJSONImages[i].scale === "1x" ? "" : "@" + contentJSONImages[i].scale) + fileInfo.ext + "?path=" + encodeURIComponent(files[file]);
                    }
                }
                throw Error("No file found in Xcode asset content.json");
            }
            else {

            }
        }
        return schema + "://" + files[file];
    }
}


/**
 * Workspace constructor options parameter object
 * @typedef {Object} workspaceOptions
 * @property {string} path - Path of the workspace.
 * @property {string} projectJSONPath - Path of the project.json file relative to workspace. Defaults to path.join(options.path, "config", "project.json")
 * @property {string} scriptsPath - Path of the scripts folder relative to workspace. Defaults to path.join(options.path, "scripts")
 * @property {string} imagesPath - Path of the scripts folder relative to workspace. Defaults to path.join(options.path, "images")
 * @property {string} assetsPath - Path of the scripts folder relative to workspace. Defaults to path.join(options.path, "assets")
 * @property {string} fontConfigPath - Path of the FontConfig.xml file relative to workspace. Defaults to path.join(options.path, "config", "FontConfig.xml")
 * @property {object} globalOptions - will be used indexing for rau.json. this options must be included rau, path.
 */

/**
 * Creates a new workspace instance with options
 * @class
 * @param {workspaceOptions} options - Required. Creates a workspace with required options
 */
function Workspace(options) {
    if (!(this instanceof Workspace))
        return new Workspace(options);
    if (!options) {
        throw Error("Options are  required");
    }

    /** @type {string} */
    this.path = options.path || "/home/ubuntu/workspace/";

    /** @type {string} */
    this.projectJSONPath = path.join(this.path, options.projectJSONPath || path.join("config", "project.json"));

    /** @type {string} */
    this.scriptsPath = path.join(this.path, options.scriptsPath || "scripts");

    /** @type {string} */
    this.imagesPath = path.join(this.path, options.imagesPath || "images");

    /** @type {string} */
    this.assetsPath = path.join(this.path, options.assetsPath || "assets");

    /** @type {string} */
    this.configPath = path.join(this.path, options.configPath || "config");

    /** @type {string} */
    this.fontConfigPath = path.join(this.path, options.fontConfigPath || path.join("config", "FontConfig.xml"));

    /** @type {object} */
    globalOptions = options.globalOptions;

    this.setGlobalOptions = function(_opt) {
        globalOptions = _opt;
    };
}

function injectErrors(index, errors) {
    if (errors.length === 0) {
        return index;
    }
    var validKeys = ["projectID", "info"];
    for (var k in index) {
        if (validKeys.indexOf(k) === -1) {
            delete index[k];
        }
    }
    index.errors = errors;
    return index;
}

Workspace.prototype.getIndex = getIndex;

module.exports = Workspace;
