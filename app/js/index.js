$(document).ready(function() {

});

function setup() {
  fill(100);
  var canvas = createCanvas($(window).width(), 300);
  canvas.parent('hero');

  for (var i=0; i < 200; i++) {
    pixels.push(new Pixel());
  }
}

function windowResized() {
  resizeCanvas($(window).width(), 300);
}

function draw() {
  background(200);
  update();

  for (var i=0; i<pixels.length; i++) {
    var pixel = pixels[i];
    ellipse(pixel.pos.x, pixel.pos.y, pixel.size,pixel.size);
  }
}

function update() {
  for (var i=0; i<pixels.length; i++) {
    var pixel = pixels[i];
    pixel.move();
  }
}

var pixels = [];
function Pixel() {
  var self = this;
  this.pos = randomPoint(width, height);
  this.speed = randomSpeed(maxSpeed);
  this.size = 10;
  this.minSize = 5;

  this.dest = null;
  this.move = function() {
    if (self.dest !== null) {
      var diff = new Point(self.dest.x - self.pos.x,
                           self.dest.y - self.pos.y);
      self.pos.add(diff.scaled(Math.min(maxSpeed, diff.hypotenuse())));
    } else {
      self.pos.add(self.speed);
    }

    if (self.size <= self.minSize) {
      if (Math.random() * 100 <1) {
          self.size+=10;
      }
    } else {
      self.size-=0.3;
    }
  };
}

var maxSpeed = 0.5;
var width = 0;
var height = 0;
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

  this.hypotenuse = function() {
    return Math.sqrt(Math.pow(self.x, 2) + Math.pow(self.y, 2));
  };

  this.copy = function() {
    return new Point(self.x, self.y);
  };
}
