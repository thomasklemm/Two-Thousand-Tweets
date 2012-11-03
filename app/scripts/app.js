// Create App
var TS = Em.Application.create({
  // ready: function() {
  //   // Set current time once per second
  //   setInterval(function() {TS.stats.setCurrentTime()}, 1000);
  // }
});

// Prototype Extensions
String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

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
  Em.Object.create({id: 1, label: "1 Hour",     format: "YYYY-M-DD HH:00",    last_digit_zero: false}),
  Em.Object.create({id: 2, label: "10 Minutes", format: "YYYY-M-DD HH:mm",    last_digit_zero: true}),
  selected_chart =
  Em.Object.create({id: 3, label: "1 Minute",   format: "YYYY-M-DD HH:mm",    last_digit_zero: false}),
  Em.Object.create({id: 4, label: "10 Seconds", format: "YYYY-M-DD HH:mm:ss", last_digit_zero: true})
]

// Charts Controller
TS.chartsC = Em.Object.create({
  selectedChart: selected_chart,
  content: charts,
  // Render graph on selection change
  selectedChartChanged: function() {
    // Render graph
    draw_graph();
  }.observes('selectedChart')
});

// Stats Object
TS.stats = Em.Object.create({
  // Date range of tweets
  date_begin: null,
  date_end: null,

  // Averages per timeframe
  avg_hours:      0,
  avg_10_minutes: 0,
  avg_minutes:    0,
  avg_10_seconds: 0,

  // Maxima per timeframe
  max_hours:      0,
  max_10_minutes: 0,
  max_minutes:    0,
  max_10_seconds: 0,

  // Current time
  // for initial graph
  current_time: 'now',

  // Set current time
  // runs every second
  // setCurrentTime: function() {
  //   this.set('current_time', moment().format("YYYY-M-DD HH:mm:ss"));
  // },

  // Reset all stats
  // e.g. when new search is being submitted
  reset: function() {
    // Date Range of tweets
    this.set('date_begin', null);
    this.set('date_end', null);

    // Maxima per timeframe
    this.set('max_hours', 0);
    this.set('max_10_minutes', 0);
    this.set('max_minutes', 0);
    this.set('max_10_seconds', 0);

    // Averages per timeframe
    this.set('avg_hours', 0);
    this.set('avg_10_minutes', 0);
    this.set('avg_minutes', 0);
    this.set('avg_10_seconds', 0);
  },

  // Set current stats from tweet in processing
  // e.g. time range of retrieved tweets
  tweetStats: function(tweet) {
      // Initial store of first tweet
      if (!TS.stats.date_begin) TS.stats.set('date_begin', tweet.created_at);
      if (!TS.stats.date_end)   TS.stats.set('date_end', tweet.created_at);

      // Current stats
      if (tweet.created_at < TS.stats.date_begin) TS.stats.set('date_begin', tweet.created_at);
      if (tweet.created_at > TS.stats.date_end)   TS.stats.set('date_end', tweet.created_at);
  },

  // Computed Time Range of Tweets
  // Relative time ('2 minutes ago')
  oldest: function() {
    var time = this.get('date_begin');
    time = time ? moment(time).fromNow() : '-';
    return time.capitalize();
  }.property('date_begin').cacheable(),

  newest: function() {
    var time = this.get('date_end');
    time = time ? moment(time).fromNow() : '-';
    return time.capitalize();
  }.property('date_end').cacheable(),

  // Calendar time ('Today at 12:00 PM')
  oldest_time: function() {
    time = this.get('date_begin');
    return time ? moment(time).calendar() : '-';
  }.property('date_begin').cacheable(),

  newest_time: function() {
    time = this.get('date_end');
    return time ? moment(time).calendar() : '-';
  }.property('date_end').cacheable(),
});

/**************************
* Views
**************************/

// SearchField
TS.SearchField = Em.TextField.extend({
  // Autofocus after insert
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

    // Perform search only if query is present
    // otherwise reset view and return
    if (Em.empty(query)) {
      this.set('content', []);
      TS.stats.reset();
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
      var add_count = self.addTweets(data.results)

      // Exit search loop if no new tweets were added in the current run
      if (add_count === 0) return;

      // Exit search loop if query changed
      if (orig_query !== self.get('query')) return;

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
    // Array for new unique tweets to be added to collection
    var self = this;
    var new_tweets = [];

    // Iterate over given raw tweets
    var length = tweets.length;
    for (i = 0; i < length; i++) {
      // Single raw tweet
      var t = tweets[i];

      // Create a tweet model for each raw tweet
      // and map respective values
      var tweet = TS.Tweet.create({
        id:         t.id,
        name:       t.from_user_name,
        login:      t.from_user,
        text:       t.text,
        image_url:  t.profile_image_url,
        created_at: new Date(t.created_at)
      });

      // Check for uniqueness of tweet
      // If it is unique then...
      //   a) add it to the new_tweets array
      //   b) store the tweet's id in _idCache
      if (self._idCache.indexOf(tweet.id) === -1) {
        new_tweets.push(tweet);
        self._idCache.push(tweet.id);

        // Store _minId for next search loop run
        if (!self._minId) self.set('_minId', tweet.id);
        if (tweet.id < self._minId) self.set('_minId', tweet.id);

        // Refresh stats
        // e.g. time range of retrieved tweets
        TS.stats.tweetStats(tweet);
      }
    };

    // Push tweets to array
    this.pushObjects(new_tweets);

    // Return length of new tweets
    // to be able to abort search if no new tweets can be found
    return new_tweets.length;
  },

  // Count tweets
  // flagged as property dependend on content.@each
  tweetsCount: function() {
    return this.get('content').length;
  }.property('content.@each').cacheable(),

  // Observer called when content array
  // containing tweet models changes
  contentChanged: function() {
    // Calculate and set new graph data
    draw_graph();
  }.observes('content.@each')
});

/**************************
* App Logic
**************************/

// Draw a new morris.js graph
draw_graph = function() {
  // Get current tweets
  var tweets = TS.tweetsC.get('content');

  // Calculate Graph data from tweets array
  var graph_data = format_tweet_data_for_morris(tweets);

  // Refresh graph with new data
  graph.setData(graph_data);
};

format_tweet_data_for_morris = function(tweets) {
  // Determine timeframe
  var timeframe = TS.chartsC.selectedChart;

  // Count tweets per timeframe
  var tweets_and_counts = tweets_count_per_time(tweets, timeframe);

  // Format data for morris
  var data = [];
  for (time in tweets_and_counts) {
    data.push({'time': time, 'count': tweets_and_counts[time]});
  };

  // Return sample data if there is no current data
  // empties chart when resetting query
  if (Em.empty(data)) return data = [{'time': TS.stats.current_time, 'count': 0}];

  // Return data formatted for morris
  return data;
};

// Group tweets by timeframe
// Takes tweets array and a time format string
// and groups tweets accordingly
// Returns an object with times as properties and ...
tweets_count_per_time  = function(tweets, timeframe) {
  // Times with tweet count
  var times_and_counts = {};

  // Iterate over tweets
  // to transform their timestamp to a common format,
  // and count the tweets for each timestamp
  var length = tweets.length;
  for (i = 0; i < length; i++) {
    var tweet = tweets[i];
    var time = moment(tweet.created_at).format(timeframe.format);

    // For 10 minutes and 10 seconds frame
    // replace last digit with 0
    if (timeframe.last_digit_zero) {
      time = time.slice(0, -1) + '0';
    }

    // Increment timestamp counter
    times_and_counts[time] = (times_and_counts[time] || 0) + 1;
  }

  // Return times and counts
  return times_and_counts;
};

// max_tweets = function(group) {
//   max = 0;

//   for (key in group) {
//     if (group[key] > max) max = group[key];
//   };

//   return max;
// }

var graph = Morris.Line({
  element: 'chart',
  data: [{'time': TS.stats.current_time, 'count': 0}],
  xkey: 'time',
  ykeys: ['count'],
  labels: ['Tweets'],
  // Skip time parsing for X values, instead treating them
  // as an equally-spaced series
  // parseTime: false
});
