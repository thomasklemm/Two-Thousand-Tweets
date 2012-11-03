// Create App
var TS = Em.Application.create();

/**************************
* Models
**************************/

// Tweet model
//   name       <- Real Name (Thomas Klemm)
//   login      <- Twitter Handle (@thomasjklemm)
//   image_url  <- Avatar Url (http://..../../avatar.png)
//   text       <- Tweet Content ('We are the world.')
//   created_at <- Date of the tweet as Date
//   timeago    <- Relative timestamp as a computed property
TS.Tweet = Em.Object.extend({
  name: null,
  login: null,
  image_url: null,
  text: null,
  created_at: null,
  timeago: function() {
    var created = this.get('created_at');
    return moment(created).fromNow();
  }.property('created_at').cacheable()
});

// Charts Object
// to determine which timeframe for graphing is selected
var selected_chart = null;
var charts = [
    Em.Object.create({id: 1, label: "1 Hour"}),
    Em.Object.create({id: 2, label: "10 Minutes"}),
    selected_chart = Em.Object.create({id: 3, label: "1 Minute"}),
    Em.Object.create({id: 4, label: "10 Seconds"})
]

// Charts Controller
TS.chartsC = Em.Object.create({
  selectedChart: selected_chart,
  content: charts
});

// Stats Object
TS.stats = Em.Object.create({
  // Date range of tweets
  date_begin: null,
  date_end: null,

  // Averages per timeframe
  avg_hours:   0.0,
  avg_minutes: 0.0,
  avg_seconds: 0.0,

  // Maxiumums per timeframe
  max_hours:   0,
  max_minutes: 0,
  max_seconds: 0,

  // Reset all stats
  // e.g. when new search is being submitted
  reset: function() {
    this.set('date_begin', null);
    this.set('date_end', null);

    this.set('max_hours', 0);
    this.set('max_minutes', 0);
    this.set('max_seconds', 0);

    this.set('avg_hours', 0);
    this.set('avg_minutes', 0);
    this.set('avg_seconds', 0);
  },

  // Computed Stats
  // Relative Timestamps for begin and end of tweets' data range
  oldest: function() {
    var time = this.get('date_begin');
    time = time ? moment(time).fromNow() : '-';
    return time.capitalizeFirstLetter();
  }.property('date_begin').cacheable(),

  oldest_time: function() {
    time = this.get('date_begin');
    return time ? moment(time).format('HH:mm:ss') : '-';
  }.property('date_begin').cacheable(),

  newest: function() {
    var time = this.get('date_end');
    time = time ? moment(time).fromNow() : '-';
    return time.capitalizeFirstLetter();
  }.property('date_end').cacheable(),
});

/**************************
* Views
**************************/

// SearchField
// with Autofocus
TS.SearchField = Em.TextField.extend({
  didInsertElement: function() {
    this.$().focus();
  }
});

/**************************
* Controllers
**************************/

// Tweets Controller
// handles the Array of Tweets
// Implements search logic
// Auto-updates the view if underlying array changes
TS.tweetsC = Em.ArrayController.create({
  // Defaults
  content: [],
  query: null,

  // Simple idCache to ensure uniqueness of tweets added
  _idCache: [],
  _minId: null,

  // Search for a certain query
  // and get all recent tweets
  search: function() {
    var query = this.get('query');

    // Perform search only if query is present, otherwise return
    if (Em.empty(query)) {
      return;
    }

    // Reset tweets array, _idCache, and _minId
    // Reset statistics object
    this.set('content', []);
    this.set('_idCache', []);
    this.set('_minId', null);
    TS.stats.reset();

    // Build initial query string
    var fragment = "?q=" + encodeURIComponent(query);

    // Poll Twitter
    this.searchTwitter(fragment, query);
  },

  // Poll Twitter
  // and push resulting tweet objects to content array
  // Calls itself with new max_id when there might be more tweets to fetch
  // otherwise returns if no new tweets were added
  searchTwitter: function(fragment, orig_query) {
    // Variables
    var url = "http://search.twitter.com/search.json" + fragment + "&callback=?"
    var next_fragment = null;
    var self = this;

    // Poll Twitter JSON Search API
    $.getJSON(url, function(data) {
      // Add tweets to collection
      // Returns number of tweets added
      var tweets_added_count = self.addTweets(data.results)

      // Exit search loop if no new tweets were added in the current run
      if (tweets_added_count === 0) return;

      // Exit search loop if query changed
      if (orig_query == self.get('query') return;

      // Build fragment for next search run containing new and lower max_id
      // of the currently oldest retrieved tweet
      next_fragment = "?q=" + encodeURIComponent(orig_query) + "&max_id=" + self.get('_minId');

      // Poll Twitter once again
      self.searchTwitter(next_fragment, orig_query);
    });
  },

  // Adds Tweets to tweetsC's content array
  // Checks for uniqueness of tweets and tries to prevent duplicates
  // Returns the number of unique tweets that were added to the collection
  addTweets: function(tweets) {
    var new_tweets = [];
    var self = this;

    for (var i = 0; i < tweets.length; i++) {
      // Map relevant values
      var t = tweets[i]
      var tweet = TS.Tweet.create({
        id:         t.id,
        name:       t.from_user_name,
        login:      t.from_user,
        text:       t.text,
        image_url:  t.profile_image_url,
        created_at: new Date(t.created_at)
      });

      // Add tweet to collection unless it is already in there
      if (this._idCache.indexOf(tweet.id) === -1) {
        new_tweets.push(tweet);
        // Maybe unshift
        this._idCache.push(tweet.id);

        // Store _minId
        if (!self._minId) self.set('_minId', tweet.id);
        if (tweet.id < self._minId) self.set('_minId', tweet.id);

        // Store oldest tweet date
        if (!TS.stats.date_begin) {
          TS.stats.set('date_begin', tweet.created_at)
        } else if (tweet.created_at < TS.stats.date_begin) {
          TS.stats.set('date_begin', tweet.created_at)
        }

        // Store newest tweet date
        if (!TS.stats.date_end) {
          TS.stats.set('date_end', tweet.created_at)
        } else if (tweet.created_at > TS.stats.date_end) {
          TS.stats.set('date_end', tweet.created_at)
        }
      }
    }

    // Push tweets to array
    this.pushObjects(new_tweets);

    // Return length of new tweets
    // to be able to abort search if no new tweets can be found
    return new_tweets.length;
  },

  // Count tweets
  // and flag function as a computed property dependent on content
  // cacheable might already be default
  tweetsCount: function() {
    return this.get('content').length;
  }.property('content.@each').cacheable(),

  contentChanged: function() {
    var content = this.get('content');
    var new_data =  graph_data(content);
    graph.setData(new_data);
    $('img.lazy').lazyload();
  }.observes('content.@each')
});

/**************************
* App Logic
**************************/

random_number = function() {
  return Math.floor(Math.random()*1001)
}

var format_string_hours   = 'YYYY-M-DD HH:00';
var format_string_minutes = 'YYYY-M-DD HH:mm';
var format_string_seconds = 'YYYY-M-DD HH:mm:ss';
var current_time = moment().format(format_string_minutes);

format_string = function(max) {
  return format_string_hour;
  if (max < 100) {
    return format_string_hour;
  } else if (max < 200) {

  };
};

group_tweets = function(content, timeframe) {
  // Format string to use for time formatting
  var format_string = format_string_minutes;
  if (timeframe == 'hours') {
    format_string = format_string_hours;
  } else if (timeframe == 'seconds') {
    format_string = format_string_seconds;
  }

  group = {};

  content.map(function(tweet) {
    var time = moment(tweet.created_at).format(format_string);
    // Transform to 10 second windows
    if (format_string == format_string_seconds) {
      time = time.slice(0, -1) + '0'
    }

    group[time] = (group[time] || 0) + 1;
  });

  return group;
}

max_tweets = function(group) {
  max = 0;

  for (key in group) {
    if (group[key] > max) max = group[key];
  };

  return max;
}

graph_data = function(content) {
  var group_hours   = group_tweets(content, 'hours');
  var group_minutes = group_tweets(content, 'minutes');
  var group_seconds = group_tweets(content, 'seconds');

  var max_hours   = max_tweets(group_hours);
  var max_minutes = max_tweets(group_minutes);
  var max_seconds = max_tweets(group_seconds);

  TS.stats.set('max_hours',   max_hours);
  TS.stats.set('max_minutes', max_minutes);
  TS.stats.set('max_seconds', max_seconds);

  // Determine which group to display
  var group = {};
  if (content.length < 120) {
    group = group_minutes;
  } else if (max_hours < 170) {
    group = group_hours;
  } else if (max_minutes > 30) {
    group = group_seconds;
  } else {
    group = group_minutes;
  }

  var data = []
  for (time in group) {
    data.push({'time': time, 'count': group[time]});
  };

  // Return data
  if (!Em.empty(data)) {
    return data;
  } else {
    return data = [{'time': current_time, 'count': 0}]
  }
};

var graph = Morris.Line({
  element: 'chart',
  data: [{'time': current_time, 'count': 0}],
  xkey: 'time',
  ykeys: ['count'],
  labels: ['Tweets'],
  // Skip time parsing for X values, instead treating them
  // as an equally-spaced series
  // parseTime: false
});
