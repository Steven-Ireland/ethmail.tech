var updater;
var pixels = [];

$(document).ready(function() {
  updater = new Worker('js/indexworker.js');

  updater.addEventListener('message', function(msg) {
    pixels = JSON.parse(msg.data);
  });

  updater.postMessage('start');
});

var height = 300;
var width = 300;
function setup() {
  var canvas = createCanvas(300,300);
  canvas.parent('canvasContainer');

  $('canvas').click(function() {
    updater.postMessage('swap');
  });
}

function windowResized() {
  resizeCanvas(width, height);
}

function draw() {
  background(245);

  for (var i=0; i<pixels.length; i++) {
    var pixel = pixels[i];
    fill('#363636');
    ellipse(pixel.pos.x, pixel.pos.y, pixel.size,pixel.size);
  }
}
