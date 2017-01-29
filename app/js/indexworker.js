var work = null;
var pixels = [];
var height = 300;
var width = 300;
var duration_hold = 3000;
var duration_explode = 200;
var numPixels = 300;
var mode = 'eth';

self.addEventListener('message', function(msg) {
  if (pixels.length === 0) {
    for (var i=0; i < numPixels; i++) {
      pixels.push(new Pixel());
    }
    makeEth();
  }

  if (msg.data === 'start' && !work){
    work = setInterval(update, 1000 / 60);
  }
  else if (msg.data === 'swap' && work) {
    makeSwap();
  }
});

function update() {
  for (var i=0; i<numPixels; i++) {
    var pixel = pixels[i];
    pixel.move();
  }
  self.postMessage(JSON.stringify(pixels));
}


function makeSwap() {
  makeFree();

  if (mode === 'eth') {
    mode = 'mail';
    setTimeout(makeMail, duration_explode);
  } else {
    mode = 'eth';
    setTimeout(makeEth, duration_explode);
  }
}

function makeEth() {
  var segments = [
    new Segment(new Point(50, 150), new Point(150, 0)), // start top quadrangle
    new Segment(new Point(150, 0), new Point(250, 150)),
    new Segment(new Point(250, 150), new Point(150, 200)),
    new Segment(new Point(150, 200), new Point(50, 150)), // End top quadrangle

    new Segment(new Point(150,100), new Point(50, 150)), // start top inner triangle
    new Segment(new Point(150,100), new Point(150, 0)),
    new Segment(new Point(150, 100), new Point(250, 150)), // end top inner triangle

    new Segment(new Point(50, 170), new Point(150, 300)), // start bottom quadrangle
    new Segment(new Point(150, 300), new Point(250, 170)),
    new Segment(new Point(250, 170), new Point(150, 220)),
    new Segment(new Point(150, 220), new Point(50, 170)) // end bottom quadrangle
  ];
  var numSegments = segments.length;

  for (var i = 0; i< numPixels; i++) {
    pixels[i].dest = segments[i % numSegments].getPointAfter(i*0.9);
  }

}

function makeMail() {
  var segments = [
    new Segment(new Point(20,50), new Point(280, 50)),
    new Segment(new Point(280,50), new Point(280, 250)),
    new Segment(new Point(280,250), new Point(20, 250)),
    new Segment(new Point(20,250), new Point(20, 50)),

    new Segment(new Point(20,50), new Point(150, 170)),
    new Segment(new Point(280,50), new Point(150, 170)),

    new Segment(new Point(280,250), new Point(190, 130)),
    new Segment(new Point(20,250), new Point(110, 130)),
  ];
  var numSegments = segments.length;

  for (var i = 0; i< numPixels; i++) {
    pixels[i].dest = segments[i % numSegments].getPointAfter(i*1);
  }
}

function makeFree() {
  for (var i = 0; i< numPixels; i++) {
    pixels[i].dest = null;
    pixels[i].done = false;
  }
}


function Pixel() {
  var self = this;
  this.pos = randomPoint(width, height);
  this.speed = randomSpeed(maxSpeed);
  this.size = 5 + Math.ceil(Math.random()*5);
  this.minSize = 5;
  this.done = false;

  this.color = function() {

  };

  this.dest = null;
  this.move = function() {
    if (self.dest !== null) {
      if (!self.done) {
        var diff = self.dest.copy().subtract(self.pos);
        if (diff.x === 0 && diff.y === 0) {
          self.done = true;
        } else {
          self.pos.add(diff.scaled(Math.min(transferSpeed, diff.hypotenuse())));
        }
      }
    } else {
        if (self.pos.x < 0 || self.pos.x > width) {
          self.speed.x *= -1;
        }
        if (self.pos.y < 0 || self.pos.y > height) {
          self.speed.y *= -1;
        }
        self.pos.add(self.speed);
    }

    if (self.size <= self.minSize) {
      if (Math.random() * 100 <2) {
          self.size+=5;
      }
    } else {
      self.size-=0.05;
    }
  };
}

var maxSpeed = 3.0;
var transferSpeed = 10.0;
function randomPoint(x,y) {
  return new Point(Math.random()*x, Math.random()*y);
}

function randomSpeed(speed) {
  var xneg = Math.sign(Math.random()-0.5);
  var yneg = Math.sign(Math.random()-0.5);
  return randomPoint(speed * xneg, speed*yneg);
}

function Point(x,y) {
  var self = this;
  this.x = x;
  this.y = y;

  this.scaled = function(scale) {
    var max = Math.max(Math.abs(self.x), Math.abs(self.y));

    if (max === 0) {
      return new Point(0,0);
    } else {
      // (sx*a)^2 + (sy*a)^2 = scale^2
      var sx= self.x / max, sy = self.y / max;
      var sx2 = Math.pow(sx, 2);
      var sy2 = Math.pow(sy, 2);
      var a = Math.pow(scale, 2) / (sx2 + sy2);

      var ret =  new Point(Math.sqrt(a * sx2) * Math.sign(sx), Math.sqrt(a * sy2) * Math.sign(sy));
      return ret;
    }
  };

  this.add = function(point) {
    self.x += point.x;
    self.y += point.y;
    return this;
  };

  this.subtract = function(point) {
    self.x -= point.x;
    self.y -= point.y;
    return this;
  };

  this.hypotenuse = function() {
    return Math.sqrt(Math.pow(self.x, 2) + Math.pow(self.y, 2));
  };

  this.copy = function() {
    return new Point(self.x, self.y);
  };
}

function Segment(start, end) {
  var self = this;
  this.start = start;
  this.end = end;

  this.getPointAfter = function(x) {
    var slope = self.end.copy().subtract(self.start).scaled(1);
    var distance = self.end.copy().subtract(self.start).hypotenuse();

    var actualAmount = x % distance;
    return new Point(this.start.x + slope.x * actualAmount, this.start.y + slope.y * actualAmount);
  };
}
