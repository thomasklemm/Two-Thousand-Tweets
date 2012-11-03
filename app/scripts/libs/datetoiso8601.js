// Date to iso8601
// Transforms a date to an iso8601 compatible string
// as required by popular timeago libraries
// Source: Mozilla Developer Network
// Url: https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toISOString

;if ( !Date.prototype.toISO8601 ) {

    ( function() {

        function pad(number) {
            var r = String(number);
            if ( r.length === 1 ) {
                r = '0' + r;
            }
            return r;
        }

        Date.prototype.toISO8601 = function() {
            return this.getUTCFullYear()
                + '-' + pad( this.getUTCMonth() + 1 )
                + '-' + pad( this.getUTCDate() )
                + 'T' + pad( this.getUTCHours() )
                + ':' + pad( this.getUTCMinutes() )
                + ':' + pad( this.getUTCSeconds() )
                + 'Z';
        };

    }() );
}
