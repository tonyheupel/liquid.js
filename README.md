# Liquid.js

Liquid.js is a browser version of the Liquid Templating language (see http://github.com/shopify/liquid).  
Liquid.js is available as both [plain JavaScript](https://raw.github.com/tchype/liquid.js/master/liquid.js) and as [minified JavaScript](https://raw.github.com/tchype/liquid.js/master/liquid.min.js).

In addition to core Liquid, Partials have been added as a way to reduce duplication in markup.  
You register templates and reference them via the **{% partial %}** tag.

This library is built in the [node-liquify project](http://github.com/tchype/node-liquify).
See that project for details on what other projects are used to build Liquid.js.

## Usage

You may simply reference the liquid.js/liquid.min.js file in your page, register your partials (if you use them), and enjoy!


```html
<html>
  <head>
    <meta http-equiv="Content-type" content="text/html; charset=utf-8">
    <title>Client-Side Liquid Templates</title>
    <script type="text/javascript" src="http://ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js"></script>

	<script type="text/javascript" src="./javascripts/liquid.min.js"></script>
    <script type="text/javascript">
      var Liquid = require('liquid');
    </script>
  </head>

  <body>
    <script id="simplewithfilter" type="text/liquid">
      <div>Here is the value of foobar in uppercase: <strong>{{ foobar | upcase }}</strong></div>
    </script>

	<script id="ifblock" type="text/liquid">
      <div>
        Trying out the if block.  If it works, you should see "Hooray!":&nbsp;
        {% if cheer %}
        Hooray!
        {% else %}
        Boo!
        {% endif %}
      </div>
	</script>

	<div id="page" style="display:none;">
      {% partial simplewithfilter %}
      {% partial ifblock %}
	</div>

    <script type="text/javascript">
      $(function() {
        Liquid.Partial.registerTemplates();  // Finds all script tags with type="text/liquid" and registers them as partials

        var page = $('#page');
        var pageTemplate = page.html();
        page.html(Liquid.Template.parse(pageTemplate).render({ foobar: 'bizbuzz', cheer: true })).show();
      });
    </script>
  </body>
</html>
```

Results in the following html page:

Here is the value of foobar in uppercase: **BIZBUZZ**

Trying out the if block. If it works, you should see "Hooray!":  Hooray!


## Acknowledgements
I have to take a minute to recognize the efforts of others.

The huge, gigantic **THANK YOU** has to go to [sirlantis (Marcel Jekwerth)](http://github.com/sirlantis) for even taking on the task of
porting Liquid into node.  Without his work on this front, I probably would have given up trying to implement it in purely
client-side JavaScript at some point.  Instead, his previous efforts and eagerness to accept pull requests and ideas for
liquid-node have made it simply less than a week-long project to get something working!

Also, a big thank you goes out to [substack](http://github.com/substack) for [browserify](http://github.com/substack/node-browserify) as
well as the overall contributions to node and Open Source.  Thanks!

Finally, the biggest thank you (as well as an "_I'm sorry for keeping my nose in the computer all weekend_") has to go to my lovely wife and
my silly, wonderful boys.  Thanks for being patient with me!!

