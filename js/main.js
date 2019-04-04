console.clear();

// Polyfill for IE11
if (window.NodeList && !NodeList.prototype.forEach) {
  NodeList.prototype.forEach = Array.prototype.forEach;
}

/**
 * This class provides provides a filter that causes distortion
 * based on a screen size and in relation to the user's cursor.
 *
 * @class ScreenFilter
 * @augments PIXI.Filter
 * @author Liam Egan <liam@wethecollective.com>
 * @version 1.0.0
 * @created Mar 20, 2019
 */
class ScreenFilter extends PIXI.Filter {

  /**
   * The Screenfilter constructor assembles all of the uniforms 
   * and initialises the superclass.
   *
   * @constructor
   * @param {Number} resolution         The resolution of the application, essentially the pixel depth
   */
  constructor(resolution) {
    // Construct the super class based on the default vertex shader and the fragment shader from the ScreenFilter
    super(PIXI.Filter.defaultVertexSrc, ScreenFilter.fragmentSrc);

    this.resolution = resolution;

    // Set up the filter uniforms
    this.uniforms.time = 0;
    this.uniforms.mouse = [0,0];
    this.uniforms.u_resolution = [window.innerWidth*this.resolution,window.innerHeight*this.resolution];
    this.uniforms.ratio = this.uniforms.u_resolution[1] < this.uniforms.u_resolution[0] ? this.uniforms.u_resolution[0] / this.uniforms.u_resolution[1] : this.uniforms.u_resolution[1] / this.uniforms.u_resolution[0];

    // This simply stops the filter from passing unexpected params to our shader
    this.autoFit = false;
    
    // Bund our resize handler
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Reacts to the window resize event. Calculates the new size of the filter
   *
   * @public
   * @return null
   */
  onResize() {
    this.uniforms.u_resolution = [window.innerWidth*this.resolution,window.innerHeight*this.resolution];
    this.uniforms.ratio = this.uniforms.u_resolution[1] < this.uniforms.u_resolution[0] ? this.uniforms.u_resolution[0] / this.uniforms.u_resolution[1] : this.uniforms.u_resolution[1] / this.uniforms.u_resolution[0];
  }

  /**
   * (getter) The fragment shader for the screen filter
   *
   * @static
   * @type {string}
   */
  static get fragmentSrc() {
    return `
  /*
    Sceen distortion filter
    -------------------
    
    This shader expects to operate on a screen sized container (essentailly the whole menu)
    and take the output of the program and distort it in a radial pattern, applying some
    bloomed blur and noisy waves toward the edge, centered on the mouse.

  */  
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
  
  // Return a random number between 0 and 1 based on a vec2
  float rand(vec2 c){
	  return fract(sin(dot(c.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  // This is sort of a cheap and dirty precursor to full on
  // Perlin noise. We could have happily used a more expensive
  // noise algorithm here, but this is more than sufficient 
  // for our needs.
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

  // Blur a texture based on a 7 sample laplacian
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
    // Generate our normalized, centered UV coordinates
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    // Get the mouse coordinates in relation to the frament coords
    vec2 uvm = uv - mouse;
    uvm /= ratio;
    // The radial mouse gradient. We use this to apply our blur
    vec2 raidalmouse = smoothstep(.3, 2., abs(uvm) * 2.);

    // Initialise our texture output
    vec4 tex = vec4(0.);

    // The centered texture coordinates
    vec2 textureCoord = vTextureCoord - .5;
    // The polar texture coordinates
    vec2 polar = vec2(length(textureCoord), atan(textureCoord.y,textureCoord.x));
    // This distorts the texture in a wave pattern around our mouse position.
    polar.y += smoothstep(.1, 2., abs(uvm.x) * 2.);
    // polar.y += smoothstep(.1, 2., abs(uvm.x) * 4.); // uncomment this to see the effects of ramping up the mouse vector
    // This is just converting our polar texture coordinates back into cartesian coordinates
    textureCoord = vec2( cos(polar.y) * polar.x, sin(polar.y) * polar.x );

    // This just increases the size of the text slightly as it gets further from the middle of the mouse position
    // Essentially this is multiplying texture in the Y direction based on the distance from the centre of the mouse
    textureCoord.y *= 1. - abs(uvm.x * 1.5) * .3;
    // textureCoord *= 1. - smoothstep(.2, .5, length(uvm)) * .3; // Uncomment this line to ramp up this effect

    // Now, the good stuff!
    // Add some noise to the texture coordinate  (with a time component, naturally) and 
    // multiply the effect by a gradient centered on the mouse's position.
    textureCoord += noise(uv, 10000. + sin(time) * 5000.) * smoothstep(.15, 2., abs(uvm.x)) * .6;
    // This just recenters the coordinate
    textureCoord += .5;

    // Gather the blur samples build the texture
    tex = blur13(uSampler, textureCoord, u_resolution, vec2(clamp(raidalmouse.x*20., 0., 5.), 0.));
    tex += blur13(uSampler, textureCoord, u_resolution, vec2(0., clamp(raidalmouse.x*20., 0., 5.)));
    tex *= .5;

    // If you want to get rid of the blur, use the below instead of the above, it will just spit out the 
    // exact texture based on all of the above
    // vec4 tex = texture2D(uSampler, textureCoord);

    // assemble the colour based on the texture multiplied by a gradient of the mouse position - this 
    // just fades the texture out at the edges
    gl_FragColor = tex * 1. - smoothstep(.5, 1.5, length(uvm)*2.);

    // Uncomment the below to output the combination of the blurred, distorted texture and a gradient
    // representing the mouse position
    // gl_FragColor = vec4(vec3(1. - smoothstep(.2, .25, length(uvm)) * .3), 1.);
    // gl_FragColor = mix(gl_FragColor, tex, tex.a);
  }
`;
  }

  /**
   * Override the parent apply method so that we can increment the time uniform for
   * the purpose of supplying a time component to the shader.
   */
  apply(filterManager, input, output) {
    // Increment the time uniform
    this.uniforms.time += .01;
    // Apply the filter.
    filterManager.applyFilter(this, input, output);
  }
  
  /**
   * (getter/setter) The mouse position. Setting this will update the mouse
   * uniform that's supplied to the shader.
   *
   * @type {array}
   * @default [0,0]
   */
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

/**
 * This class provides provides a filter that provides the hover
 * styles to the buttoms. Essentially this is just supplying some
 * basic noise on hover now, but it could really do anything a 
 * fragment shader can do.
 *
 * @class HoverFilter
 * @augments PIXI.Filter
 * @author Liam Egan <liam@wethecollective.com>
 * @version 1.0.0
 * @created Mar 20, 2019
 */
class HoverFilter extends PIXI.Filter {

  /**
   * The HoverFilter constructor assembles all of the uniforms 
   * and initialises the superclass.
   *
   * @constructor
   */
  constructor() {
    super(PIXI.Filter.defaultVertexSrc, HoverFilter.fragmentSrc);
    this.uniforms.time = 0;
  }

  /**
   * (getter) The fragment shader for the screen filter
   *
   * @static
   * @type {string}
   */
  static get fragmentSrc() {
    return `
  /*
    Hover filter
    -------------------
    
    This shader expects to operate on a display object within a pixi application.
    It takes the output of the display object and applies some noise to it based
    on the objects alpha channel, in this way clamping the colour to the bounts
    of the text that makes up the button

  */  
  precision highp float;
  varying vec2 vTextureCoord;

  uniform sampler2D uSampler;
  uniform vec4 inputClamp;
  uniform vec4 inputSize;
  uniform vec4 inputPixel;
  uniform vec4 outputFrame;
  uniform float time;

  #define PI 3.14159265359
  
  // Return a random number between 0 and 1 based on a vec2
  float rand(vec2 c){
	  return fract(sin(dot(c.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  // Some FBM noise based on a value component
  // see https://thebookofshaders.com/13/ for more details
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

  // Create a pattern based on a normalised uv coordinate. In this
  // example we're making some noise and setting a couple of colours,
  // but you could make this any sort of pattern
  vec4 pattern(vec2 uv) {

    // Increasing the frequency of the noise
    uv *= 3.;
    // modify our time component, making it faster
    float t = time*2.;

    // Create our noise
    float pattern = fbm(vec3(uv, t));
    // Create our base colour
    vec4 rtn = vec4( 0.145, 0.239, 0.357, 1. ); // dark blue
    // mux this colour with another based on the noise value
    rtn = mix(rtn, vec4( 0.88, 0.88, 0.88, 1. ), smoothstep(.0, 1., pattern)); // sort of a light light grey colour
    return rtn;
    
  }

  void main(void){
    // Generate our normalized, centered UV coordinates
    vec2 uv = (gl_FragCoord.xy - 0.5 * inputSize.xy) / min(inputSize.x, inputSize.y);
    // Get the base texture - this is the display object from pixi
    vec4 tex = texture2D(uSampler, vTextureCoord);

    // output the pattern constrained by the texture's alpha
    gl_FragColor = vec4((tex.a) * pattern(uv));
  }
`;
  }

  /**
   * Override the parent apply method so that we can increment the time uniform for
   * the purpose of supplying a time component to the shader.
   */
  apply(filterManager, input, output)
  {
    this.uniforms.time += .01;

    filterManager.applyFilter(this, input, output);
  }
}

/**
 * This class provides encapsulates the navigation as a whole. It is provided the base
 * navigation element which it reads and recreates in the Pixi application
 *
 * @class Navigation
 * @author Liam Egan <liam@wethecollective.com>
 * @version 1.0.0
 * @created Mar 20, 2019
 */
class Navigation {

  /**
   * The Navigation constructor saves the navigation element and binds all of the 
   * basic listener methods for the class.
   * 
   * The provided nav element should serve as both a container to the pixi canvas
   * as well as containing the links that will become the navigation. It's important
   * to understand that any elements within the navigation element that might appear
   * will be covered by the application canvas, so it should serve only as a 
   * container for the navigation links and the application canvas.
   *
   * @constructor
   * @param {HTMLElement} nav         The navigation container.
   */
  constructor(nav) {
    // Save the nav
    this.nav = nav;

    // Set up the basic object property requirements.
    this.navItems = [];         // This will contain the generic nav item objects
    this.app = null;            // The PIXI application
    this.container = null;      // The PIXI container element that will contain the nav elements
    this.screenFilter = null;   // The screen filter to be appliced to the container
    this.navWidth = null;       // The full width of the navigation
    this.background = null;     // The container for the background graphic

    // Bind the listener methods to the class instance
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onResize = this.onResize.bind(this);
  }
  
  /**
   * Initialises the navigation. Creates the navigation items, sets up the pixi 
   * application, and binds the various listeners.
   *
   * @public
   * @return null
   */
  init() {
    // Find all of the anchors within the nav element and create generic object
    // holders for them. 
    const els = this.nav.querySelectorAll('a');
    els.forEach((el) => {
      this.navItems.push({
        rootElement:  el,             // The anchor element upon which this nav item is based
        title:        el.innerText,   // The text of the nav item
        element:      null,           // This will be a canvas representation of the nav item
        sprite:       null,           // The PIXI.Sprite element that will be appended to stage
        link:         el.href         // The link's href. This will be used when clicking on the button within the nav
      });
    });
    
    // Set up the various requirements
    this.makeNavItems();              // Set up the nav items
    this.setupWebGLContext();         // Set up the pixi application and append it to the document
    
    // Bind the various listener methods to their appropriate listeners
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('resize', this.onResize);
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
  
  /**
   * Initialises the PIXI application and appends it to the nav element
   *
   * @public
   * @return null
   */
  setupWebGLContext() {
    // Create the pixi application, setting the background colour, width and
    // height and pixel resolution.
    this.app = new PIXI.Application({
      backgroundColor: this.backgroundColour,
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: 2
    });
    // Ofsetting the stage to the middle of the page. I find it easier to 
    // position things to a point in the middle of the window, so I do this
    // but you might find it easier to position to the top left.
    this.app.stage.x = window.innerWidth * .5;
    this.app.stage.y = window.innerHeight * .5;
    
    // Create the container and apply the screen filter to it.
    this.container = new PIXI.Container();
    this.screenFilter = new ScreenFilter(2);
    this.app.stage.filters = [this.screenFilter];
    
    // Measure what will be the full pixel width of the navigation 
    // Then loop through the nav elements and append them to the containter
    let ipos = 0;                                 // The tracked position for each element in the navigation
    this.navWidth = 0;                            // The full width of the navigation
    this.navItems.forEach((item) => {
      this.navWidth += item.sprite.width;
    });
    this.navItems.forEach((item) => {
      item.sprite.x = this.navWidth * -.5 + ipos; // Calculate the position of the nav element to the nav width
      ipos += item.sprite.width;                  // update the ipos
      this.container.addChild(item.sprite);       // Add the sprite to the container
    });
    
    // Create the background graphic 
    this.background = new PIXI.Graphics();
    this.setupBackground();

    // Add the background and the container to the stage
    this.app.stage.addChild(this.background);
    this.app.stage.addChild(this.container);

    // Set the various necessary attributes and class for the canvas 
    // elmenent and append it to the nav element.
    this.app.view.setAttribute('aria-hidden', 'true');    // This just hides the element from the document reader (for sight-impaired people)
    this.app.view.setAttribute('tab-index', '-1');        // This takes the canvas element out of tab order completely (tabbing will be handled programatically using the actual links)
    this.app.view.className = 'main-nav__canvas';         // Add the class name
    this.nav.appendChild(this.app.view);                  // Append the canvas to the nav element
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

  setupBackground() {
    this.background.clear();
    this.background.beginFill(this.backgroundColour, 0.);
    this.background.position.x = window.innerWidth * -.5;
    this.background.position.y = window.innerHeight * -.5;
    this.background.drawRect(-this.maskpadding,-this.maskpadding, window.innerWidth+this.maskpadding, window.innerHeight+this.maskpadding);
    this.background.endFill();
    
    const mask = new PIXI.Graphics();
    mask.beginFill(this.backgroundColour, .5);
    mask.position.x = window.innerWidth * -.5;
    mask.position.y = window.innerHeight * -.5;
    mask.drawRect(-this.maskpadding,-this.maskpadding, window.innerWidth+this.maskpadding, window.innerHeight+this.maskpadding);
    mask.endFill();
    this.container.mask = mask;
  }
  
  onResize(e) {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.app.stage.x = window.innerWidth * .5;
    this.app.stage.y = window.innerHeight * .5;

    this.setupBackground();
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

  set backgroundColour(value) {
    const colourval = /^#([0-9ABCDEF]{6,6})/i.exec(value);
    if(typeof(value) == 'string' && colourval != null) {
      this._backgroundColour = `0x${colourval[1]}`*1;
    } else if(typeof(value) == 'number') {
      this._backgroundColour = value;
    }
  }
  get backgroundColour() {
    return this._backgroundColour || 0xF9F9F9;
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