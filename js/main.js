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
  // Fast gaussien blur - https://github.com/Jam3/glsl-fast-gaussian-blur
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
    // Add some noise to the texture coordinate (with a time component, naturally) and 
    // multiply the effect by a gradient centered on the mouse's position.
    textureCoord += noise(uv, 10000. + sin(time) * 5000.) * smoothstep(.15, 2., abs(uvm.x)) * .6;
    // This just recenters the coordinate
    textureCoord += .5;

    // Gather the blur samples build the texture
    //tex = blur13(uSampler, textureCoord, u_resolution, vec2(clamp(raidalmouse.x*20., 0., 5.), 0.));
    //tex += blur13(uSampler, textureCoord, u_resolution, vec2(0., clamp(raidalmouse.x*20., 0., 5.)));
    //tex *= .5;

    // If you want to get rid of the blur, use the below instead of the above, it will just spit out the 
    // exact texture based on all of the above
    tex = texture2D(uSampler, textureCoord);

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

  float distortedFBM(in vec3 x) {
    float t = fbm(x);
    x.xy += (t -.5);
    t *= fbm(x);
    x.xy += (t -.5) * .6;
    t = fbm(x);
    return t;
  }

  // Create a pattern based on a normalised uv coordinate. In this
  // example we're making some noise and setting a couple of colours,
  // but you could make this any sort of pattern
  vec4 pattern(vec2 uv) {

    // Increasing the frequency of the noise
    uv *= 4.;
    // modify our time component, making it faster
    float t = time*2.;

    // Create our noise

    float pattern = distortedFBM(vec3(uv, t));
    pattern *= pattern * 1.2;
    // Create our base colour
    vec4 rtn = vec4( 0.81, 0.33, 0, 1. ); // dark blue
    // mux this colour with another based on the noise value
    rtn = mix(rtn, vec4( 1. ), smoothstep(.0, 1., pattern)); // sort of a light light grey colour
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
    this.initialised = false;   // Whether the navigation is already initialised
    this.navItems = [];         // This will contain the generic nav item objects
    this.app = null;            // The PIXI application
    this.container = null;      // The PIXI container element that will contain the nav elements
    this.screenFilter = null;   // The screen filter to be appliced to the container
    this.navWidth = null;       // The full width of the navigation
    this.background = null;     // The container for the background graphic
    this.pointerdown = false;   // Indicates whether the user's pointer is currently down on the page
    this.dragging = false;      // Indicates whether the nav is currently being dragged. This is here to allow for both the dragging of the nav and the tapping of elements.
    this.targetMousePos = [0,0]; // The targetMousePos is used for animating the mouse position

    // Bind the listener methods to the class instance
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onOpen = this.onOpen.bind(this);
    this.onClose = this.onClose.bind(this);
    this.animate = this.animate.bind(this);
  }
  
  /**
   * Initialises the navigation. Creates the navigation items, sets up the pixi 
   * application, and binds the various listeners.
   *
   * @public
   * @return null
   */
  init() {
    this.initialised = true;

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
    window.addEventListener('navOpen', this.onOpen);
    window.addEventListener('navClose', this.onClose);
  }
  
  /**
   * Initialises the Navigation item elements, initialising their canvas 
   * renditions, their pixi sprites and initialising their interactivity.
   *
   * @public
   * @return null
   */
  makeNavItems() {
    if(!this.initialised) return;

    // Loop through the navItems object
    this.navItems.forEach((navItem, i) => {
      // Make the nav element (the canvas rendition of the anchor) for this item.
      navItem.element = this.makeNavItem(navItem.title, navItem.link);

      // Create the PIXI sprite from the canvas
      navItem.sprite = PIXI.Sprite.from(navItem.element);

      // Turn the sprite into a button and initialise the various event listeners
      navItem.sprite.interactive = true;
      navItem.sprite.buttonMode = true;
      const filter = new HoverFilter();
      // This provides a callback for focus on the root element, providing us with
      // a way to cause navigation on tab.
      navItem.rootElement.addEventListener('focus', ()=> {
        this.focusNavItemByIndex(i);
        navItem.sprite.filters = [filter];
      });
      navItem.rootElement.addEventListener('blur', ()=> {
        navItem.sprite.filters = [];
      });
      // on pointer over, add the filter
      navItem.sprite.on('pointerover', (e)=> {
        navItem.sprite.filters = [filter];
      });
      // on pointer out remove the filter
      navItem.sprite.on('pointerout', (e)=> {
        navItem.sprite.filters = [];
      });
      // On pointer up, if we're not dragging the navigation, execute a click on
      // the root navigation element.
      navItem.sprite.on('pointerup', (e)=> {
        if(this.dragging) return;
        navItem.rootElement.click();
      });
    });
  }
  
  /**
   * Public methods
   */

  /**
   * Initialises the Navigation item as a canvas element. This takes a string and renders it
   * to the canvas using fillText. 
   *
   * @public
   * @param {String} title      The text of the link element
   * @return {Canvas}           The canvas alement that contains the text rendition of the link
   */
  makeNavItem(title) {
    if(!this.initialised) return;

    // Create an offscreen canvas and context
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');

    // Set up our font
    const font = 'tenez';
    const fontSize = 80;
    const fontWeight = 400;

    ctx.font = `${fontWeight} ${fontSize}px ${font}`;

    // Make our canvas the size of the text  with a padding of 50px
    c.width = ctx.measureText(title).width + 50;
    c.height = fontSize*1.5;

    // Draw the text into the canvas
    ctx.font = `${fontWeight} ${fontSize}px ${font}`;
    ctx.textAlign="center";
    ctx.textBaseline="bottom"; 
    ctx.fillStyle = "rgba(223,143,86,1)";
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
    if(!this.initialised) return;

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
  
  /**
   * Given a numeric index, this calculates the position of the 
   * associated nav element within the application and simulates
   * a mouse move to that position.
   *
   * @public
   * @param {Number} index      The index of the navigation element to focus.
   * @return null
   */
  focusNavItemByIndex(index) {
    if(!this.initialised) return;

    let c = 0;
    
    // loop through the nav items and increment the position 
    // until the required index is reached.
    this.navItems.forEach((item, i) => {
      let perWidth = item.element.width / this.navWidth;
      if(i < index) {
        c += perWidth;
      } else if(i === index) {
        c += perWidth * .5;
      }
    });
    
    // Calculate the mouse position.
    let mousepos = [window.innerWidth * .1 + (window.innerWidth*.8) * c, window.innerHeight * .5];
    this.mousepos = mousepos;
  }
  
  /**
   * Removes all of the event listeners and any association of
   * the navigation object, preparing the instance for garbage
   * collection.
   * 
   * This method is unused in this demo, but exists here to 
   * provide somewhere for you to remove all remnents of the 
   * instance from memory, if and when you might need to.
   * 
   *
   * @public
   * @return null
   */
  deInit() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
  }

  /**
   * Redraws the background graphic and the container mask.
   *
   * @public
   * @return null
   */
  setupBackground() {
    if(!this.initialised) return;

    // The background graphic is just a matte that lives behind everything.
    // If you wanted to you could apply a filter to this to create a pattern
    // or animation in the background to the navigation. For the purposes
    // of this demo, this is just a block of colour.
    this.background.clear();
    this.background.beginFill(this.backgroundColour, 0.);
    this.background.position.x = window.innerWidth * -.5;
    this.background.position.y = window.innerHeight * -.5;
    this.background.drawRect(-this.maskpadding,-this.maskpadding, window.innerWidth+this.maskpadding, window.innerHeight+this.maskpadding);
    this.background.endFill();
    
    // We mask the container so that the dimensions that PIXI provides to 
    // our screen filter are predictable. If we don't do this, then the 
    // behaviour of the shader becomes unpredictable and weird. The reason 
    // that we pad the mask is so that we have a slightly larger than the
    // screen area to play with within the shader.
    const mask = new PIXI.Graphics();
    mask.beginFill(this.backgroundColour, .5);
    mask.position.x = window.innerWidth * -.5;
    mask.position.y = window.innerHeight * -.5;
    mask.drawRect(-this.maskpadding,-this.maskpadding, window.innerWidth+this.maskpadding, window.innerHeight+this.maskpadding);
    mask.endFill();
    this.container.mask = mask;
  }

  /**
   * Coerces the mouse position as a vector with units in the 0-1 range
   *
   * @public
   * @param {Array} mousepos_px      An array of the mouse's position on screen in pixels
   * @return {Array}
   */
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

  /**
   * Coerces the mouse position from a vector with units in the 0-1 range
   * to screen coordinates
   *
   * @public
   * @param {Array} mousepos      An array of the mouse's position on screen the 0-1 range
   * @return {Array}
   */
  unfixMousePos(mousepos) {
    let ratio = window.innerHeight / window.innerWidth;
    let mousepos_px = [];
    if(window.innerHeight > window.innerWidth) {
      mousepos_px[0] = mousepos[0] * window.innerWidth + (window.innerWidth / 2);
      mousepos_px[1] = mousepos[1] * window.innerHeight / -1 / ratio + (window.innerHeight / 2);
    } else {
      mousepos_px[0] = mousepos[0] * window.innerWidth * ratio + (window.innerWidth / 2);
      mousepos_px[1] = mousepos[1] * window.innerHeight / -1 + (window.innerHeight / 2);
    }
    
    return mousepos_px;
  }


  
  /**
   * Event callbacks
   */
  
  /**
   * Responds to the window resize event, resizing the stage and redrawing 
   * the background.
   *
   * @public
   * @param {Object} e     The event object
   * @return null
   */
  onResize(e) {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.app.stage.x = window.innerWidth * .5;
    this.app.stage.y = window.innerHeight * .5;

    this.setupBackground();
  }
  
  /**
   * Responds to the window pointer move event, updating the application's mouse
   * position.
   *
   * @public
   * @param {Object} e     The event object
   * @return null
   */
  onPointerMove(e) {
    if(this.animatingPointer === true) {
      if(this.dragging || e.pointerType === 'mouse') {
        this.targetMousePos = [e.pageX, e.pageY];
      }
      return;
    }
    if(this.dragging || e.pointerType === 'mouse') {
      this.mousepos = [e.pageX, e.pageY];
    }
  }
  
  /**
   * Responds to the window pointer down event, creating a timeout that checks,
   * after a short period of time, whether the pointer is still down, after 
   * which it sets the dragging property to true.
   *
   * @public
   * @param {Object} e     The event object
   * @return null
   */
  onPointerDown(e) {
    this.pointerdown = true;
    setTimeout(()=> {
      if(this.pointerdown === true) this.dragging = true;
    }, 300);
  }
  
  /**
   * Responds to the window pointer up event, sets pointer down to false and,
   * after a short time, sets dragging to false.
   *
   * @public
   * @param {Object} e     The event object
   * @return null
   */
  onPointerUp(e) {
    this.pointerdown = false;
    setTimeout(()=> {
      this.dragging = false;
    }, 300);
  }
  
  /**
   * Responds to the custom navOpen event fired when the navigation is opened.
   * This listener doesn't do anything mission critical, so it can be skipped
   * if necessary.
   *
   * @public
   * @param {Object} e     The event object
   * @return null
   */
  onOpen() {
    this.animatingPointer = true;
    this.focusNavItemByIndex(0);
    this.targetMousePos = this.unfixMousePos(this.mousepos);
    this.mousepos = [3000, window.innerHeight*.5];
  }
  /**
   * Responds to the custom navClosed event fired when the navigation is closed.
   *
   * @public
   * @param {Object} e     The event object
   * @return null
   */
  onClose() {
    this.animatingPointer = false;
  }
  
  /**
   * Responds to request animation frame. Responsible for rendering any 
   * animation events
   *
   * @public
   * @param {Number} delta  The time variable, provided by RaF
   * @return null
   */
  animate(delta) {
    if(this.animatingPointer === true) requestAnimationFrame(this.animate);
    const pxMousepos = this.unfixMousePos(this.mousepos);
    const diff = [this.targetMousePos[0] - pxMousepos[0], this.targetMousePos[1] - pxMousepos[1]];
    pxMousepos[0] += (diff[0]) * .05;
    pxMousepos[1] += (diff[1]) * .05;
    this.mousepos = pxMousepos;
    // const l = Math.sqrt((diff[0] * diff[0]) + (diff[1] * diff[1]));
    // if(l < 1) {
    //   this.animatingPointer = false;
    // }
  }
  
  /**
   * Getters and setters (properties)
   */

  /**
   * (getter/setter) The colour of the application background. This can take
   * a number or an RGB hex string in the format of '#FFFFFF'. It stores
   * the colour as a number
   *
   * @type {number/string}
   * @default 0x151515
   */
  set backgroundColour(value) {
    // A regex that determines whether the passed string (if string it is)
    // is in the required format.
    const colourval = /^#([0-9ABCDEF]{6,6})/i.exec(value);
    if(typeof(value) == 'string' && colourval != null) {
      // If we have a string and it's in the right format, convert it to a numbe
      this._backgroundColour = `0x${colourval[1]}`*1;
    } else if(typeof(value) == 'number') {
      // If it's a number, save it
      this._backgroundColour = value;
    }
    // reset the background.
    this.setupBackground();
  }
  get backgroundColour() {
    return this._backgroundColour || 0x151515;
  }

  /**
   * (getter/setter) A flag that specifies whether the simulation is 
   * currently animating the mouse position. If this is set to true
   * then the pointer listener will simply return.
   *
   * @type {bolean}
   * @default false
   */
  set animatingPointer(value) {
    const wasAnimating = this.animatingPointer;
    this._animating = value === true;
    if(wasAnimating === false && this.animatingPointer === true) {
      requestAnimationFrame(this.animate);
    }
  }
  get animatingPointer() {
    return this._animating || false;
  }

  /**
   * (getter/setter) A flag that specifies whether the the user is
   * currently dragging the simulation. This exists to toggle the
   * animation of the position based on the pointer position when
   * the user is interacting by dragging.
   *
   * @type {bolean}
   * @default false
   */
  set dragging(value) {
    if(value === true) {
      this.old_animatingPointer = this.animatingPointer;
      this.animatingPointer = false;
      this._dragging = true;
    } else {
      this._dragging = false;
    }
  }
  get dragging() {
    return this._dragging || false;
  }

  /**
   * (getter/setter) The position of the mouse/pointer on screen. This 
   * updates the position of the navigation in response to the cursor
   * and fixes the mouse position before passing it to the screen
   * filter.
   *
   * @type {Array}
   * @default [0,0]
   */
  set mousepos(value) {
    
    // Find the position of the container relating to the mouse and set it.
    const p = value[0] / window.innerWidth;
    this.container.position.x = -(this.navWidth * .5) + (1. - p) * this.navWidth;
    
    // Fix the mouse position, save it and pass it onto the screen filter
    value = this.fixMousePos(value);
    if(value instanceof Array && value.length === 2 && !isNaN(value[0]) && !isNaN(value[1])) {
      this._mousepos = value;
      if(this.screenFilter) this.screenFilter.mousepos = value;
    }
  }
  get mousepos() {
    return this._mousepos || [0,0];
  }

  /**
   * (getter/setter) The amount of padding at the edge of the screen. This
   * is sort of an arbitrary value at the moment, so if you start to see 
   * tearing at the edge of the text, make this value a little higher
   *
   * @type {Number}
   * @default 100
   */
  set maskpadding(value) {
    if(!isNaN(value)) this._maskpadding = value;
  }
  get maskpadding() {
    if(!isNaN(this._maskpadding)) return this._maskpadding;
    return 100;
  }
}

// The nav toggle is the checkbox that determines the visibility of the main nav
const navToggle = document.getElementById('main-nav-toggle');
// Set up the keyup listener on the nav toggle elements. This just makes sure 
// that these labels work as expected for keyboard users
document.addEventListener('keyup', (e) => {
  if(e.target.className.indexOf('nav-toggle') && (e.keyCode === 13 || e.keyCode === 32)) {
    navToggle.checked = !navToggle.checked;
    e.preventDefault();
  }
});
// This listener exists to fire the open event which the nav listens to. This
// Just spawns the open animation
navToggle.addEventListener('change', (e) => {
  let eventName;
  console.log(e.target.checked);
  if(e.target.checked) {
    eventName = 'navOpen';
  } else {
    eventName = 'navClose';
  } 

  if (window.CustomEvent) {
    var event = new CustomEvent(eventName);
  } else {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent(eventName, true, true);
  }
  
  window.dispatchEvent(event);
});
//navToggle.checked = true;

// Create the navigation based on teh nav element
const nav = new Navigation(document.querySelector('.main-nav'));

window.navigation = nav;

// Load the web font and, once it's loaded, initialise the nav.
WebFont.load({
  typekit: {
    id: 'phg5cnq'
  },
  /*google: {
    families: ['Abril Fatface']
  },*/
  active: () => {
    nav.init();
    nav.focusNavItemByIndex(0);
    // trigger the checkbox change event to start up the animation
    var event = document.createEvent('HTMLEvents');
    event.initEvent('change', true, false);
    navToggle.dispatchEvent(event);
  }
});