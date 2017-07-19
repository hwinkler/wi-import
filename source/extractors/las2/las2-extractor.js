'use strict';
let readline = require('line-by-line');
let hashDir = require('../../hash-dir');
let fs = require('fs');

let __config = require('../common-config');

function writeToCurveFile(buffer, curveFileName, index, value, defaultNull, callback) {
    let indexNull;
    let dataNull;
    try {
        buffer.count += 1;
        if(index == 0) {
            if(value == defaultNull) {
                buffer.data += index + " undefined" + "\n";
            }
            else {
                buffer.data += index + " " + value + "\n";
            }
        }
        else {
            if(value == defaultNull) {
            }
            else {
                buffer.data += index + " " + value + "\n";
            }
        }
        if (buffer.count >= 1000) {
            fs.appendFileSync(curveFileName, buffer.data);
            buffer.count = 0;
            buffer.data = "";
        }
    }
    catch (err) {
        callback(err);
    }
    callback();
}

function extractCurves(inputURL, label, defaultNull, pathsCallBack ) {
    let rl = new readline(inputURL);
    let curveNames = new Array();
    let count = 0;
    let BUFFERS = new Object();
    let filePaths = new Object();
    let nameSection;

    rl.on('line', function (line) {
        line = line.trim();
        line = line.replace(/\s+\s/g, " ");
        if (/^~A|^~ASCII/g.test(line.toUpperCase())) {
            if (curveNames) {
                curveNames.forEach(function (curveName) {
                    BUFFERS[curveName] = {
                        count: 0,
                        data: ""
                    };
                    filePaths[curveName] = hashDir.createPath(__config.basePath, inputURL + label + curveName, curveName + '.txt');

                    fs.writeFileSync(filePaths[curveName], "");

                });
            }
        }
        else if (/^~/g.test(line.toUpperCase())) {
            nameSection = line.toUpperCase();
        }
        else if (/^[A-z]/g.test(line)) {
            if (/CURVE/g.test(nameSection)) {
                line = line.replace(/([0-9]):([0-9])/g, "$1=$2");
                let dotPosition = line.indexOf('.');
                let fieldName = line.substring(0, dotPosition);
                if (curveNames) {
                    curveNames.push(fieldName.trim());
                }
            }
        }

        else if (/^[0-9][0-9]/g.test(line)) {
            let fields = line.split(" ");
            if (curveNames) {
                curveNames.forEach(function (curveName, i) {
                    writeToCurveFile(BUFFERS[curveName], filePaths[curveName], count, fields[i], defaultNull, function (err) {
                        if (err) console.log('File format is not true', err);
                    });
                });
                count++;
            }
        }
    });
    rl.on('end', function () {
        if (curveNames) {
            curveNames.forEach(function (curveName) {
                fs.appendFileSync(filePaths[curveName], BUFFERS[curveName].data);
            });
        }
        pathsCallBack(filePaths, curveNames);
        console.log("ExtractCurvesFromLAS done");
    });

    rl.on('error', function (err) {
        if (err) console.log("ExtractCurves has error", err);
    });
}

function getUniqueIdForDataset(sections) {
    function getWellInfoSection(sections) {
        for (var i in sections) {
            if (sections[i].name == "~WELL") {
                return sections[i];
            }
        }
        return null;
    }
    let wellInfoSection = getWellInfoSection(sections);
    if (!wellInfoSection) {
        console.log("Error here");
        console.log(sections);
        return null;
    }

    var uwi = null;
    var name = null;
    for (var j in wellInfoSection.content) {

        if (wellInfoSection.content[j].name == "UWI"){
            uwi = wellInfoSection.content[j].data;
        }
        else if ( wellInfoSection.content[j].name.toUpperCase().trim() == "WELL" ) {
            name = wellInfoSection.content[j].data;
        } 
    }

    console.log('****************', wellInfoSection, name, uwi);
    return name || uwi;
}

function extractWell(inputURL, resultCallback, options) {
    let rl = new readline(inputURL);
    let sections = new Array();
    let currentSection = null;
    let defaultNull = null;

    rl.on('line', function (line) {
        line = line.trim();
        if (/^~A/.test(line)) { //
            // end case
            rl.close();
        }
        else if (line === '') { // skip blank line
        }
        else if (/^#/.test(line)) { // skip line with leading '#'
        }
        else if (/^~/.test(line)) { // beginning of a section
            if (currentSection) {
                sections.push(currentSection);
            }

            currentSection = new Object();
            currentSection.name = line.toUpperCase();
            currentSection.content = new Array();
        }
        else {
            if (currentSection) {
                if (/[A-z]/.test(line)) {
                    line = line.replace(/([0-9]):([0-9])/g, "$1=$2");
                    let dotPosition = line.indexOf('.');
                    let fieldName = line.substring(0, dotPosition);
                    let remainingString = line.substring(dotPosition, line.length).trim();
                    let firstSpaceAfterDotPos = remainingString.indexOf(' ');
                    let secondField = remainingString.substring(1, firstSpaceAfterDotPos);
                    remainingString = remainingString.substring(firstSpaceAfterDotPos, remainingString.length).trim();
                    let colonPosition = remainingString.indexOf(':');

                    if (colonPosition < 0) {
                        colonPosition = remainingString.length;
                    }
                    let fieldDescription = remainingString.substring(colonPosition, remainingString.length);
                    let thirdField = remainingString.substring(0, colonPosition).trim();
                    thirdField = thirdField.replace(/([0-9])=([0-9])/g, '$1:$2');
                    if(/NULL/g.test(fieldName.toUpperCase())) {
                        defaultNull = thirdField;
                    }
                    if(/^\./.test(secondField)) {
                        secondField = "";
                    }
                    currentSection.content.push({
                        name: fieldName.trim(),
                        unit: secondField.trim(),
                        data: thirdField,
                        description: fieldDescription.trim()
                    });
                }
            }
        }

    });
    rl.on('end', function () {
        if (currentSection) {
            sections.push(currentSection);

        }
        if (sections) {

            let label = options.label || getUniqueIdForDataset(sections);
            sections.forEach(function (section) {
                if (/CURVE/g.test(section.name)) {
                    extractCurves(inputURL, label, defaultNull, function (pathsCurve, curvesName) {
                        if (curvesName) {
                            curvesName.forEach(function (curveName, i) {
                                section.content[i].data = pathsCurve[curveName];
                            });
                        }
                        resultCallback(sections);
                    });


                }
            });
        }

    });
}

module.exports.extractCurves = extractCurves;
module.exports.extractWell = extractWell;
module.exports.setBasePath = function(basePath) {
    __config.basePath = basePath;
};
module.exports.getBasePath = function() {
    return __config.basePath;
};
