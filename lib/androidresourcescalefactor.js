var androidResourceFolderRegexes = {
    3: /.+-ldpi/,
    4: /.+-mdpi/,
    6: /.+-hdpi/,
    8: /.+-xhdpi/,
    12: /.+-xxhdpi/,
    16: /.+-xxxhdpi/
};

function getScaleFactor(resourceFolderName) {
    for (var i in androidResourceFolderRegexes) {
        var re = androidResourceFolderRegexes[i];
        re.lastIndex = 0;
        if (re.test(resourceFolderName)) {
            return i;
        }
    }
}


module.exports = getScaleFactor;