// Date to iso8601
// Transforms a date to an iso8601 compatible string
// as required by popular timeago libraries
// Source: Mozilla Developer Network
// Url: https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toISOString


function pad(number) {
  var r = String(number);
  if ( r.length === 1 ) {
    r = '0' + r;
  }
  return r;
};

Date.prototype.toSpecialString = function(minutes, seconds) {
  minutes = typeof minutes !== 'undefined' ? minutes : true;
  seconds = typeof seconds !== 'undefined' ? seconds : true;

  return this.getUTCFullYear()
    + '-' + pad( this.getUTCMonth() + 1 )
    + '-' + pad( this.getUTCDate() )
    + ' ' + pad( this.getUTCHours() )
    + ':' + (minutes ? pad( this.getUTCMinutes() ) : '00')
    +       (seconds ? (':' + pad( this.getUTCSeconds() )) : '');
};
