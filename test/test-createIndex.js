var argv = process.argv.slice(2);

if(argv.length !== 1 || !(argv[0] === "iOS" || argv[0] === "Android")) {
    console.log("Sample usage:\nnode test/test-createIndex.js Android\nnode test/test-createIndex.js iOS");
    return;
}
var Workspace = require("../lib/workspace");
var Device = require("../lib/device");

var ws = new Workspace({
    path: "/home/ubuntu/workspace/test/workspace",
    projectID: "https://someurl.com"
});

//var projectID = ws.getProjectID(true);
var start = new Date(),
    end;

var devices = {
    iOS: new Device({
        os: "iOS",
        brandName: "iPhone 6S Plus"
    }),
    Android: new Device({
        os: "Android",
        brandName: "Note 3",
        resourceFolderOrder: ["drawable-xxhdpi", "drawable-xxhdpi-landscape",
            "drawable-xxhdpi-portrait", "drawable-xxxhdpi", "drawable-xhdpi",
            "drawable-hdpi", "drawable-mdpi"
        ]
    })
};


var device = devices[argv[0]];
ws.getIndex(device,
    function indexResult(index) {
        end = new Date();
        //console.log("Performance is: " + Number(end - start) + "ms.");
        console.log(JSON.stringify(index, null, "\t"));
        process.exit(0);
    });