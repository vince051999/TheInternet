const request = require('request');
const through2 = require('through2');
const Promise = require('bluebird');
const _ = require('lodash');
const fs = require('fs');
const PNG = require('pngjs').PNG;

const regex = /<a\s+(?:[^>]*?\s+)?href="(https?:\/\/[^\/"]+)/gm;
const shot = `shot_${Math.floor(new Date() / 1000)}`;

fs.mkdirSync(shot);

var queueLock = new Set();
var queue = [
    'http://redplant.de'
];

var width = 512;
var height = 512;
var bufferLen = width * height * 4;
var pngData = new Uint8Array(bufferLen);
var sampleStep = 1;
var sampleCounter = 0;
var pngIndex = 0;
var imgIndex = 0;
var channelIndex = 0;

let saveImage = ()=>{
    console.log("save imge");
    let png = new PNG({
        width: width,
        height: height,
        filterType: -1,
        colorType: 2,
        bgColor: {
            red: 0,
            green: 0,
            blue: 0
        }
    });
    for (var j = 0; j < pngData.length; j++){
        png.data[j] = pngData[j];
    }
    png.pack().pipe(fs.createWriteStream(`${shot}/img_${_.padStart(imgIndex,4,"0")}.png`));
    fs.appendFileSync(`${shot}/log.txt`, `Frame:${imgIndex}\n`);
    imgIndex++;
}

let runUri = (uri) =>{
    return new Promise((resolve,reject)=>{
        console.log("runUri", uri, queue.length);
        
        request(
            {
                method: 'GET'
                , uri: uri
                , gzip: true
                , rejectUnauthorized: false
                , timeout: 1500
            }
             , function (error, response, body) {
                if(error){
                    reject(error);
                    return;
                }

                let newUrls = [];
                let m;

                while ((m = regex.exec(body)) !== null) {
                    if (m.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }

                    let matchURI = m[1];
                    if(!queueLock.has(matchURI)){
                        queueLock.add(matchURI);
                        queue.push(matchURI);
                    }
                }

                fs.appendFileSync(`${shot}/log.txt`, uri+"\n");
                resolve();
            }
        )
        .pipe(through2(function (chunk, enc, callback) {
            for (var i = 0; i < chunk.length; i++){
                if(sampleCounter == 0){
                    pngData[pngIndex] = chunk[i]
                    pngIndex = (pngIndex+1) % (bufferLen);

                    if(pngIndex == 0){
                       saveImage();
                    }
                }

                sampleCounter = (sampleCounter+1) % sampleStep;
            }

            this.push(chunk);
            callback()

        })).on('data',(data)=>{
            // do nothing
        });
    });
}

let running = false;
let runQueue = () =>{
    if(!running && queue.length > 0){
        let uri = queue.shift();
        running = true;
        runUri(uri).finally(()=>{
            running = false;
        });
    }
}

setInterval(runQueue,1);


