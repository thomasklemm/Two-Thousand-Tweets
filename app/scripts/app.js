/*
* 2000 Tweets
*
* A Twitter Search based on Ember.js and Morris.js
*
* Release: 2012-11-05
* License: MIT (Thomas Klemm, 2012)
*/

// Create App
var TS = Em.Application.create({});

// Prototype Extensions
String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

/**************************
* Models
**************************/

/*
* Tweet
*
* Attributes:
*   name       <- Real Name (Thomas Klemm)
*   login      <- Twitter Handle (@thomasjklemm)
*   image_url  <- Avatar Url (http://..../../avatar.png)
*   text       <- Tweet Content ('We are the world.')
*   created_at <- Date of the tweet as Date
*   timeago    <- Relative timestamp as a computed property
*/
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


/*
* Chart
*/

// Charts Preparation
var selected_chart = null;
var charts = [
  Em.Object.create({id: 1, label: "1 Hour", stats_key: "hours",
    format: "YYYY-M-DD HH:00", last_digit_zero: false, in_ms: 3600000}),

  Em.Object.create({id: 2, label: "10 Minutes", stats_key: "10_minutes",
    format: "YYYY-M-DD HH:mm", last_digit_zero: true, in_ms: 600000}),

  selected_chart = Em.Object.create({id: 3, label: "1 Minute", stats_key: "minutes",
    format: "YYYY-M-DD HH:mm", last_digit_zero: false, in_ms: 60000}),

  Em.Object.create({id: 4, label: "10 Seconds", stats_key: "10_seconds",
    format: "YYYY-M-DD HH:mm:ss", last_digit_zero: true, in_ms: 10000})
]

// Charts Controller
// Handles the available and selected chart time horizons
// and changes in the currently selected timeframe
TS.chartsC = Em.Object.create({
  selectedChart: selected_chart,
  content: charts,
  // Render graph on selection change
  selectedChartChanged: function() {
    // Render graph
    draw_graph();
  }.observes('selectedChart')
});


/*
* Statistics
*/

// Stats Object
// saves all statistical values
// and flags required for operation
TS.stats = Em.Object.create({
  // Query
  query: null,

  // Flag that indicates whether the search is active
  // or has been canceled
  searching: false,

  // Date range of tweets
  date_begin: null,
  date_end: null,

  // Current time
  // for initial graph
  current_time: 'now',

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

  // Date of maxima per timeframe
  max_hours_time:      '-',
  max_10_minutes_time: '-',
  max_minutes_time:    '-',
  max_10_seconds_time: '-',

  // Show avatars of tweeters
  show_avatars: false,

  // Reset all stats
  // e.g. when new search is being submitted
  reset: function() {
    // Query and running flag
    this.set('query', null);
    this.set('running', false);

    // Date Range of tweets
    this.set('date_begin', null);
    this.set('date_end', null);

    // Averages per timeframe
    this.set('avg_hours', 0);
    this.set('avg_10_minutes', 0);
    this.set('avg_minutes', 0);
    this.set('avg_10_seconds', 0);

    // Maxima per timeframe
    this.set('max_hours', 0);
    this.set('max_10_minutes', 0);
    this.set('max_minutes', 0);
    this.set('max_10_seconds', 0);

    // Date of maxima
    this.set('max_hours_time', '-');
    this.set('max_10_minutes_time', '-');
    this.set('max_minutes_time', '-');
    this.set('max_10_seconds_time', '-');
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
    return time;
  }.property('date_begin').cacheable(),

  newest: function() {
    var time = this.get('date_end');
    time = time ? moment(time).fromNow() : '-';
    return time == 'a few seconds ago' ? 'now' : time;
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

  // Time Range of retrieved tweets
  // in milliseconds
  range: function() {
    return this.get('date_end') - this.get('date_begin');
  }.property('date_begin', 'date_end').cacheable()
});


/**************************
* Views
**************************/

// SearchField
// where the user types his or her Twitter search phrase
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

  // Count tweets
  // flagged as property dependend on content.@each
  tweetsCount: function() {
    return this.get('content').length;
  }.property('content.@each').cacheable(),

  // Initialize Twitter search
  // Search for a certain query
  // and get all recent tweets
  initSearch: function() {
    // Load query
    var query = this.get('query');

    // Perform search only if there is a new query
    var old_query = TS.stats.get('query');
    if (query === old_query) return;

    // Perform search only if query is present
    // otherwise clear view by emptying tweets array
    // and resetting stats
    if (Em.empty(query)) {
      this.resetSearch();
      TS.stats.reset();
      return;
    }

    // Reset tweet results and temporary caches
    this.resetSearch();

    // Reset statistics
    TS.stats.reset();

    // Set query
    TS.stats.set('query', query);
    TS.stats.set('searching', true);

    // Start drawing interval
    start_drawing();

    // Spawn the Search Master
    this.searchMaster(query);
    return;
  },

  // Cancel search manually
  // by setting searching flag
  // in the stats object to false
  cancelSearch: function() {
    TS.stats.set('searching', false);

    // Execute graph drawing and stats calculations
    // after a specified time
    // to wait until final search round completes
    setTimeout(function(){
      // Cancel graph drawing interval
      stop_drawing();

      // Calculate and set statistics
      calculate_stats();
    }, 2500);

    return;
  },

  // Reset tweetsC object
  // before a new query is executed
  resetSearch: function() {
    this.set('content', []);
    this.set('_idCache', []);
    this.set('_minId', null);
    return;
  },

  // Search Master
  // Controls the search flow
  searchMaster: function(query, max_id, page) {
    // Url for Search Master
    // Initially only contains query, no max_id or page
    // Later contains max_id and page as well
    var master_url = twitter_url(query, max_id, page);
    var self = this;

    // Poll Twitter JSON Search API
    $.getJSON(master_url, function(data) {
      // Add tweets to collection
      self.addTweets(data.results, query);

      //
      // Decide whether to perform next round of searches
      //

      // Cancel if query (in the stats object) has changed
      // Do not cancel if query in search field changed without submission
      var current_query = TS.stats.get('query');
      if (query !== current_query) {
        // Set searching flag to false
        self.cancelSearch();
        return;
      }

      // Cancel search if more than X tweets loaded
      var count = self.get('tweetsCount');
      if (count > 2000) {
        self.cancelSearch();
        return;
      }

      // Cancel if searching flag has been set to false
      var searching = TS.stats.get('searching');
      if (searching !== true) return;

      //
      // Spawn next round of searches
      //

      // New max_id is current minimum id
      var new_max_id = self.get('_minId');

      // Spawn workers
      // to retrieve page 1 to 11
      for (var page = 1; page <= 11; page++) {
        self.searchWorker(query, new_max_id, page);
      };

      // Send Search Master to retrieve last page in Twitter API pagination
      // and spawn workers for the next batch of pages
      var master_page = 12;
      self.searchMaster(query, new_max_id, master_page);
    });

    return;
  },

  // Search worker
  // Takes query, max_id and page, polls Twitters
  // and pushes the resulting tweet objects to content array
  searchWorker: function(query, max_id, page) {
    // Variables
    var self = this;
    var url = twitter_url(query, max_id, page);

    // Poll Twitter JSON Search API
    $.getJSON(url, function(data) {
      // Add tweets to collection
      self.addTweets(data.results, query);
    });
    return;
  },

  // Adds Tweets to tweetsC's content array
  // Checks for uniqueness of tweets and tries to prevent duplicates
  // Returns the number of unique tweets that were added to the collection
  addTweets: function(tweets, query) {
    // Array for new unique tweets to be added to collection
    var new_tweets = [];
    var self = this;

    // Return if no tweets were passed (Ajax error)
    // To allow master to retry
    if (Em.empty(tweets)) return;

    // Iterate over given raw tweets
    var length = tweets.length;
    for (var i = 0; i < length; i++) {
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

    // Get the current query
    var current_query = TS.stats.get('query');

    // Push tweets to array
    // if the query is up to date
    if (query === current_query) this.pushObjects(new_tweets);
    return;
  },



  // Observer called when content array
  // containing tweet models changes
  contentChanged: function() {
    // Calculate and set new graph data
    // draw_graph();

    // Calculate and set statistics
    // calculate_stats();
  }.observes('content.@each')
});


/**************************
* App Logic
**************************/

// Builds the twitter api url to query
twitter_url = function(query, max_id, page) {
  // Default empty string for query
  query = typeof query !== 'undefined' ? query : '';

  return 'http://search.twitter.com/search.json?q='  // base
    + encodeURIComponent(query)                      // + query
    + (max_id ? ('&max_id=' + max_id) : '')          // + max_id
    + (page ? ('&page=' + page) : '')                // + page
    + '&callback=?'                                  // + callback (allows request origin)
};


/**************************
* Graph
**************************/

// Draw a new morris.js graph
draw_graph = function() {
  // Get current tweets
  var tweets = TS.tweetsC.get('content');

  // Draw only when there are tweets
  if (Ember.empty(tweets)) return;

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
  for (var i = 0; i < length; i++) {
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

// Morris.js Line Chart
// displaying number of tweets per time unit
// features selectable timeframes
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


/**************************
* Drawing Intervals
**************************/

// Start drawing interval
start_drawing = function() {
  var id = setInterval(function() {
    // Calculate tweets distribution over time
    // and draw graph
    draw_graph();
  }, 500);

  // Set interval id in order to be able to cancel it
  TS.stats.set('drawing_interval_id', id);

  // Draw graph for the first time
  draw_graph();
  return;
};

// Cancel drawing interval
stop_drawing = function() {
  // Get interval id
  var id = TS.stats.get('drawing_interval_id');

  // Cancel interval
  clearInterval(id);

  // Draw graph once
  draw_graph();
  return;
};


/**************************
* Statistics
**************************/

// Calculate all stats
calculate_stats = function() {
  // Load tweets and timeframes
  var tweets = TS.tweetsC.get('content');
  var timeframes = TS.chartsC.get('content');

  // Calculate stats only when there are tweets
  if (Em.empty(tweets)) return;

  // Iterate over timeframes
  var length = timeframes.length;
  for (i = 0; i < length; i++) {
    var timeframe = timeframes[i];

    // Calc. and set averages for timeframe
    avg_tweets_stats(timeframe);

    // Calc. and set maxima for timeframe
    max_tweets_stats(tweets, timeframe);
  };
  return;
};

// Set a single value in the TS.stats object
set_stat = function(key, value) {
  TS.stats.set(key, value);
  return;
};

// Calculate and set average tweet counts
// for a certain timeframe
avg_tweets_stats = function(timeframe) {
  var count = TS.tweetsC.get('tweetsCount');
  var range = TS.stats.get('range');
  var avg = 0;

  // Calculate average and round result
  avg = count / (range / timeframe.in_ms);
  avg = avg.toFixed(2);

  // Set stats
  var key = "avg_" + timeframe.stats_key;
  set_stat(key, avg);
  return;
};

// Calculate and set peaks per timeframe
max_tweets_stats = function(tweets, timeframe) {
  var max = 0;
  var max_time = '-';

  // Count tweets per timeframe
  var time_and_counts = tweets_count_per_time(tweets, timeframe);

  // Interate over tweet distribution
  for (time in time_and_counts) {
    // Set maximum if count > max
    var count = time_and_counts[time];
    if (count > max) {
      max = count;
      max_time = time;
    }
  }

  // Set stats
  var key = "max_" + timeframe.stats_key;
  set_stat(key, max);

  var key_time = "max_" + timeframe.stats_key + "_time";
  set_stat(key_time, max_time);
  return;
}

/*
* The End
*/
