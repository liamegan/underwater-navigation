console.clear();

// Polyfill for IE11
if (window.NodeList && !NodeList.prototype.forEach) {
  NodeList.prototype.forEach = Array.prototype.forEach;
}

class ScreenFilter extends PIXI.Filter {
  constructor(resolution) {
    super(PIXI.Filter.defaultVertexSrc, ScreenFilter.fragmentSrc);
    this.resolution = resolution;
    this.uniforms.time = 0;
    this.uniforms.mouse = [0,0];
    this.uniforms.u_resolution = [window.innerWidth*this.resolution,window.innerHeight*this.resolution];
    this.uniforms.ratio = this.uniforms.u_resolution[1] < this.uniforms.u_resolution[0] ? this.uniforms.u_resolution[0] / this.uniforms.u_resolution[1] : this.uniforms.u_resolution[1] / this.uniforms.u_resolution[0];
    this.autoFit = false;
    
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }
  onResize() {
    this.uniforms.u_resolution = [window.innerWidth*this.resolution,window.innerHeight*this.resolution];
    this.uniforms.ratio = this.uniforms.u_resolution[1] < this.uniforms.u_resolution[0] ? this.uniforms.u_resolution[0] / this.uniforms.u_resolution[1] : this.uniforms.u_resolution[1] / this.uniforms.u_resolution[0];
  }
  static get fragmentSrc() {
    return `
  precision highp float;
  varying vec2 vTextureCoord;

  uniform sampler2D uSampler;
  uniform vec4 inputClamp;
  uniform vec4 inputSize;
  uniform vec4 inputPixel;
  uniform vec4 outputFrame;
  uniform vec2 mouse;
  uniform vec2 u_resolution;
  uniform float ratio;
  uniform float time;

  #define PI 3.14159265359
  
  float rand(vec2 c){
	  return fract(sin(dot(c.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  float noise(vec2 p, float freq ){
    float unit = inputSize.x/freq;
    vec2 ij = floor(p/unit);
    vec2 xy = mod(p,unit)/unit;
    //xy = 3.*xy*xy-2.*xy*xy*xy;
    xy = .5*(1.-cos(PI*xy));
    float a = rand((ij+vec2(0.,0.)));
    float b = rand((ij+vec2(1.,0.)));
    float c = rand((ij+vec2(0.,1.)));
    float d = rand((ij+vec2(1.,1.)));
    float x1 = mix(a, b, xy.x);
    float x2 = mix(c, d, xy.x);
    return mix(x1, x2, xy.y);
  }

  vec4 blur13(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
    vec4 color = vec4(0.0);
    vec2 off1 = vec2(1.411764705882353) * direction;
    vec2 off2 = vec2(3.2941176470588234) * direction;
    vec2 off3 = vec2(5.176470588235294) * direction;
    color += texture2D(image, uv) * 0.1964825501511404;
    color += texture2D(image, uv + (off1 / resolution)) * 0.2969069646728344;
    color += texture2D(image, uv - (off1 / resolution)) * 0.2969069646728344;
    color += texture2D(image, uv + (off2 / resolution)) * 0.09447039785044732;
    color += texture2D(image, uv - (off2 / resolution)) * 0.09447039785044732;
    color += texture2D(image, uv + (off3 / resolution)) * 0.010381362401148057;
    color += texture2D(image, uv - (off3 / resolution)) * 0.010381362401148057;
    return color;
  }

  void main(void){
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    vec2 uvm = uv - mouse;
    uvm /= ratio;
    vec2 textureCoord = vTextureCoord - .5;
    vec2 polar = vec2(length(textureCoord), atan(textureCoord.y,textureCoord.x));
    vec2 p = smoothstep(.3, 2., abs(uvm) * 2.);
    polar.y += smoothstep(.1, 2., abs(uvm.x) * 2.);
    textureCoord = vec2( cos(polar.y) * polar.x, sin(polar.y) * polar.x );
    textureCoord.y *= 1. - abs(uvm.x * 1.5) * .3;

    //textureCoord *= 1. - smoothstep(.2, .5, length(uvm)) * .3;

    textureCoord += noise(uv, 10000. + sin(time) * 5000.) * smoothstep(.15, 2., abs(uvm.x)) * .6;
    textureCoord += .5;

    // vec4 tex = texture2D(uSampler, textureCoord);

    vec4 tex = blur13(uSampler, textureCoord, u_resolution, vec2(p.x*10., 0.));
    tex += blur13(uSampler, textureCoord, u_resolution, vec2(0., p.x*10.));
    tex *= .5;

    gl_FragColor = vec4(vec3(1. - smoothstep(.2, .25, length(uvm)) * .3), 1.);
gl_FragColor = mix(gl_FragColor, tex, tex.a);

    gl_FragColor = tex * 1. - smoothstep(.5, 1.5, length(uvm)*2.);
  }
`;
  }
  apply(filterManager, input, output)
  {
    this.uniforms.time += .01;

    filterManager.applyFilter(this, input, output);
  }
  
  set mousepos(value) {
    if(value instanceof Array && value.length === 2 && !isNaN(value[0]) && !isNaN(value[1])) {
      this._mousepos = value;
      this.uniforms.mouse = value;
    }
  }
  get mousepos() {
    return this._mousepos || [0,0];
  }
}

class HoverFilter extends PIXI.Filter {
  constructor() {
    super(PIXI.Filter.defaultVertexSrc, HoverFilter.fragmentSrc);
    this.uniforms.time = 0;
  }
  static get fragmentSrc() {
    return `
  precision highp float;
  varying vec2 vTextureCoord;

  uniform sampler2D uSampler;
  uniform vec4 inputClamp;
  uniform vec4 inputSize;
  uniform vec4 inputPixel;
  uniform vec4 outputFrame;
  uniform float time;

  #define PI 3.14159265359
  
  float rand(vec2 c){
	  return fract(sin(dot(c.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  // Courtesy Robert Penner
  // t: current time, b: begInnIng value, c: change In value, d: duration
  float easeOutElastic(in float t, in float b, in float c, in float d) {
      float s=1.70158;
      float p=0.0;
      float a=c;
      if (t==0.0) {
        return b;
      }
      if ((t/=d)==1.0) {
          return b+c;
      }
      if (p == .0) {
          p=d*.3;
      }
      if (a < abs(c)) {
          a=c;
          s=p/4.0;
      } else {
          s = p/(2.0*PI) * asin(c/a);
      }
      return a*pow(2.0,-10.0*t) * sin( (t*d-s)*(2.0*PI)/p ) + c + b;
  }
  #define NUM_OCTAVES 3
  float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
  vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
  vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}

  float noise(vec3 p){
      vec3 a = floor(p);
      vec3 d = p - a;
      d = d * d * (3.0 - 2.0 * d);

      vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
      vec4 k1 = perm(b.xyxy);
      vec4 k2 = perm(k1.xyxy + b.zzww);

      vec4 c = k2 + a.zzzz;
      vec4 k3 = perm(c);
      vec4 k4 = perm(c + 1.0);

      vec4 o1 = fract(k3 * (1.0 / 41.0));
      vec4 o2 = fract(k4 * (1.0 / 41.0));

      vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
      vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

      return o4.y * d.y + o4.x * (1.0 - d.y);
  }

  float fbm(vec3 x) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100);
    for (int i = 0; i < NUM_OCTAVES; ++i) {
      v += a * noise(x);
      x = x * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  vec4 pattern(vec2 uv) {
    uv *= 3.;
    float t = time*2.;
    float modt = mod(t, 10.);

      float pattern = fbm(vec3(uv, t));
      vec4 rtn = vec4( 0.776, 0.529, 0.561, 1. );
      rtn = vec4( 0.145, 0.239, 0.357, 1. );
      // rtn = mix(rtn, vec4( 0.145, 0.239, 0.357, 1. ), smoothstep(.2, .3, pattern));
      rtn = mix(rtn, vec4( 0.88, 0.88, 0.88, 1. ), smoothstep(.0, 1., pattern));
      return rtn;

    if(modt < 2.5) {
    
      float pattern = fbm(vec3(uv, t));
      vec4 rtn = vec4( 0.776, 0.529, 0.561, 1. );
      rtn = mix(rtn, vec4( 0.145, 0.239, 0.357, 1. ), smoothstep(.2, .3, pattern));
      rtn = mix(rtn, vec4( 0.588, 0.588, 0.588, 1. ), smoothstep(.4, .5, pattern));
      return rtn;
  } else if(modt < 5.) {
      if( mod(floor(t), 2.0) == 0.0 ) {
          float change = (-1.0 + mod(ceil(uv.y), 2.0) * 2.0);
          uv.x += easeOutElastic(fract(t), .0, change, 2.0);
      } else {
          float change = (-1.0 + mod(ceil(uv.x), 2.0) * 2.0);
          uv.y += easeOutElastic(fract(t), .0, change, 2.0);
      }

      uv = fract(uv)-.5;
      float pattern = smoothstep(.3, .4, length(uv));
      vec4 rtn = vec4( 0.776, 0.529, 0.561, 1. );
      rtn = mix(rtn, vec4( 0.145, 0.239, 0.357, 1. ), pattern);
      return rtn;
    } else {
      vec3 c1 = vec3( 0.776, 0.529, 0.561 ); // C6878F
      vec3 c2 = vec3( 0.718, 0.616, 0.58 ); // B79D94
      vec3 c3 = vec3( 0.588, 0.588, 0.588 ); // 969696
      vec3 c4 = vec3( 0.145, 0.239, 0.357 ); // 253D5B

      uv *= .4;
      uv.x -= t;
      uv *= mat2(0.86602529158, -0.50000019433, 0.50000019433, 0.86602529158);
      uv.x = fract(uv.x);
      
      vec4 rtn = vec4(c1, 1.);
      rtn = mix(rtn, vec4(c2, 1.), smoothstep(.25,.26,uv.x));
      rtn = mix(rtn, vec4(c3, 1.), smoothstep(.5,.51,uv.x));
      rtn = mix(rtn, vec4(c4, 1.), smoothstep(.75,.76,uv.x));
      return rtn;
    }
    
  }

  void main(void){
    vec2 uv = (gl_FragCoord.xy - 0.5 * inputSize.xy) / min(inputSize.x, inputSize.y);
    vec4 tex = texture2D(uSampler, vTextureCoord);

    gl_FragColor = vec4((tex.a) * pattern(uv));
  }
`;
  }
  apply(filterManager, input, output)
  {
    this.uniforms.time += .01;

    filterManager.applyFilter(this, input, output);
  }
}

class Navigation {
  constructor(nav) {
    this.nav = nav;
    
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onResize = this.onResize.bind(this);
  }
  
  setupWebGLContext() {
    this.app = new PIXI.Application({
      backgroundColor: 0xFFFFFF,
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: 2
    });
    this.app.stage.x = window.innerWidth * .5;
    this.app.stage.y = window.innerHeight * .5;
    
    this.container = new PIXI.Container();
    this.screenFilter = new ScreenFilter(2);
    this.app.stage.filters = [this.screenFilter];
    
    let ipos = 0;
    this.navWidth = 0;
    this.navItems.forEach((item) => {
      this.navWidth += item.sprite.width;
    });
    this.navItems.forEach((item) => {
      item.sprite.x = this.navWidth * -.5 + ipos;
      ipos += item.sprite.width;
      this.container.addChild(item.sprite);
    });
    
    this.background = new PIXI.Graphics();
    this.background.beginFill(0xFFFFFF, 0.);
    this.background.position.x = window.innerWidth * -.5;
    this.background.position.y = window.innerHeight * -.5;
    this.background.drawRect(-this.maskpadding,-this.maskpadding, window.innerWidth+this.maskpadding, window.innerHeight+this.maskpadding);
    this.background.endFill();
    this.app.stage.addChild(this.background);
    this.app.stage.addChild(this.container);
    
    const mask = new PIXI.Graphics();
    mask.beginFill(0xFFFFFF, .5);
    mask.position.x = window.innerWidth * -.5;
    mask.position.y = window.innerHeight * -.5;
    mask.drawRect(-this.maskpadding,-this.maskpadding, window.innerWidth+this.maskpadding, window.innerHeight+this.maskpadding);
    mask.endFill();
    this.container.mask = mask;

    this.app.view.setAttribute('aria-hidden', 'true');
    this.app.view.setAttribute('tab-index', '-1');
    this.app.view.className = 'main-nav__canvas';
    this.nav.appendChild(this.app.view);
  }
  
  init() {
    const els = this.nav.querySelectorAll('a');
    
    this.navItems = [];
    
    els.forEach((el) => {
      this.navItems.push({
        rootElement:  el,
        title:        el.innerText,
        element:      null,
        sprite:       null,
        link:         el.href
      });
    });
    
    this.makeNavItems();
    this.setupWebGLContext();
    
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('resize', this.onResize);
  }
  
  focusNavItemByIndex(index) {
    let c = 0;
    
    this.navItems.forEach((item, i) => {
      let perWidth = item.element.width / this.navWidth;
      if(i < index) {
        c += perWidth;
      } else if(i === index) {
        c += perWidth * .5;
      }
    });
    
    let mousepos = [window.innerWidth * .1 + (window.innerWidth*.8) * c, window.innerHeight * .5];
    this.mousepos = mousepos;
  }
  
  deInit() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
  }
  
  makeNavItems() {
    this.navItems.forEach((navItem, i) => {
      navItem.element = this.makeNavItem(navItem.title, navItem.link);
      navItem.sprite = PIXI.Sprite.from(navItem.element);
      navItem.sprite.interactive = true;
      navItem.sprite.buttonMode = true;
      const filter = new HoverFilter();
      navItem.rootElement.addEventListener('focus', ()=> {
        this.focusNavItemByIndex(i);
        navItem.sprite.filters = [filter];
      });
      navItem.rootElement.addEventListener('blur', ()=> {
        navItem.sprite.filters = [];
      });
      navItem.sprite.on('pointerover', (e)=> {
        navItem.sprite.filters = [filter];
      });
      navItem.sprite.on('pointerout', (e)=> {
        navItem.sprite.filters = [];
      });
      navItem.sprite.on('pointerup', (e)=> {
        if(this.dragging) return;
        var event = document.createEvent('HTMLEvents');
        event.initEvent('click', true, false);
        navItem.rootElement.click();
      });
    });
  }
  makeNavItem(title) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');

    const font = 'Abril Fatface';
    const fontSize = 80;

    ctx.font = `${fontSize}px ${font}`; // This is here purely to run the measurements

    c.width = ctx.measureText(title).width + 50;
    c.height = fontSize*1.5;

    ctx.font = `${fontSize}px ${font}`;
    ctx.textAlign="center";
    ctx.textBaseline="bottom"; 
    ctx.fillStyle = "rgba(40,50,60,1)";
    ctx.fillText(title, c.width*.5, c.height-fontSize*.2);

    return c;
  }
  
  onResize(e) {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.app.stage.x = window.innerWidth * .5;
    this.app.stage.y = window.innerHeight * .5;
    
    this.background.clear();
    this.background.beginFill(0xFFFFFF, 0.);
    this.background.position.x = window.innerWidth * -.5;
    this.background.position.y = window.innerHeight * -.5;
    this.background.drawRect(-this.maskpadding,-this.maskpadding, window.innerWidth+this.maskpadding, window.innerHeight+this.maskpadding);
    this.background.endFill();
    
    const mask = new PIXI.Graphics();
    mask.beginFill(0xFFFFFF, .5);
    mask.position.x = window.innerWidth * -.5;
    mask.position.y = window.innerHeight * -.5;
    mask.drawRect(-this.maskpadding,-this.maskpadding, window.innerWidth+this.maskpadding, window.innerHeight+this.maskpadding);
    mask.endFill();
    this.container.mask = mask;
  }
  onPointerMove(e) {
    if(this.dragging || e.pointerType === 'mouse') {
      this.mousepos = [e.pageX, e.pageY];
    }
  }
  onPointerDown(e) {
    this.pointerdown = true;
    setTimeout(()=> {
      if(this.pointerdown === true) this.dragging = true;
    }, 100);
  }
  onPointerUp(e) {
    this.pointerdown = false;
    setTimeout(()=> {
      this.dragging = false;
    }, 100);
  }
  
  fixMousePos(mousepos_px) {
    let ratio = window.innerHeight / window.innerWidth;
    let mousepos = [];
    if(window.innerHeight > window.innerWidth) {
      mousepos[0] = (mousepos_px[0] - window.innerWidth / 2) / window.innerWidth;
      mousepos[1] = (mousepos_px[1] - window.innerHeight / 2) / window.innerHeight * -1 * ratio;
    } else {
      mousepos[0] = (mousepos_px[0] - window.innerWidth / 2) / window.innerWidth / ratio;
      mousepos[1] = (mousepos_px[1] - window.innerHeight / 2) / window.innerHeight * -1;
    }
    return mousepos;
  }
  
  set mousepos(value) {
    
    const p = value[0] / window.innerWidth;
    this.container.position.x = -(this.navWidth * .5) + (1. - p) * this.navWidth;
    
    value = this.fixMousePos(value);
    if(value instanceof Array && value.length === 2 && !isNaN(value[0]) && !isNaN(value[1])) {
      this._mousepos = value;
      if(this.screenFilter) this.screenFilter.mousepos = value;
    }
  }
  get mousepos() {
    return this._mousepos || [0,0];
  }

  set maskpadding(value) {
    if(!isNaN(value)) this._maskpadding = value;
  }
  get maskpadding() {
    if(!isNaN(this._maskpadding)) return this._maskpadding;
    return 100;
  }
}

const nav = new Navigation(document.querySelector('.main-nav'));
window.nav = nav

WebFont.load({
  google: {
    families: ['Abril Fatface']
  },
  active: () => {
    nav.init();
    nav.focusNavItemByIndex(0);
  }
});