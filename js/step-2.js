console.clear();

// Polyfill for IE11
if (window.NodeList && !NodeList.prototype.forEach) {
  NodeList.prototype.forEach = Array.prototype.forEach;
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
      // This provides a callback for focus on the root element, providing us with
      // a way to cause navigation on tab.
      navItem.rootElement.addEventListener('focus', ()=> {
        this.focusNavItemByIndex(i);
      });
      navItem.rootElement.addEventListener('blur', ()=> {
      });
      // On pointer up, if we're not dragging the navigation, execute a click on
      // the root navigation element.
      navItem.sprite.on('pointerup', (e)=> {
        if(this.dragging) return;
        // Create the click event and execute it on the root element (the anchor upon which this nav item is based).
        var event = document.createEvent('HTMLEvents');
        event.initEvent('click', true, false);
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
    }, 100);
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
    }, 100);
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
   * @default 0xF9F9F9
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
    return this._backgroundColour || 0xF9F9F9;
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

document.addEventListener('keyup', (e) => {
  if(e.target.className.indexOf('nav-toggle') && (e.keyCode === 13 || e.keyCode === 32)) {
    document.getElementById('main-nav-toggle').toggleAttribute('checked');
    e.preventDefault();
  }
});
document.getElementById('main-nav-toggle').toggleAttribute('checked');

// Create the navigation based on teh nav element
const nav = new Navigation(document.querySelector('.main-nav'));

// Load the web font and, once it's loaded, initialise the nav.
WebFont.load({
  google: {
    families: ['Abril Fatface']
  },
  active: () => {
    nav.init();
    nav.focusNavItemByIndex(0);
  }
});