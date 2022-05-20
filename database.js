'use strict';

const url = require('url')
const mysql = require('mysql2')

// 1. where is the app running?
var usingFlyRegion = process.env.FLY_REGION ? process.env.FLY_REGION : "unknown" // e.g "lhr"

// 2. is the app running in the same general location as the primary database? If so don't waste time
// picking a database from a list of preferences. Use the first (possibly only) one (which is the primary):
var usingPrimaryRegion = (process.env.FLY_REGION && process.env.PRIMARY_REGION && process.env.FLY_REGION === process.env.PRIMARY_REGION);

// 3. which database should be connected to?
var databaseUrl = process.env.DATABASE_URL; // first: assume no choice and there's only one
if (databaseUrl.includes(',')) {
    // ah, there's more than one (we expect a comma-separated sting). So pick the closest one
    databaseUrl = nearestDatabaseUrl(usingFlyRegion, usingPrimaryRegion, databaseUrl.split(','))
}

/**
 * Without any DNS/anycast magic have to manually work out which is the closest
 * database region to the app's region. Why? Want the closest region for the lowest latency.
 * For some apps (e.g one vm) this would be over-kill. But e.g what if a Fly app has a vm in lhr (UK) and
 * sjc (US, West). And has two Planetscale regions: a primary in eu-west and a read-only replica region
 * in us-west. If a request arrives from a user in the UK, would want *that* read to be done from the
 * primary, not the read-replica. What if a request arrives from a Fly region that has a matching Planetscale
 * region e.g us-east, but the app owner has not made a database in that region? Hence can't assume
 * the closest Planetscale region actually has a database to connect to. So a simple (Fly region => Planetscale region)
 * lookup won't do. Need a list of possible regions, ordered by preference from likely best to likely worst.
 *
 * Need to refine these arrays based on actual experience and/or ping data e.g https://www.cloudping.co/grid.
 * Generaally beyond the first few the latency will be a lot higher so need to focus on the first few of each array
 *
 * IMPORTANT: Planetscale are updating their hostnames. Their new edge regions (for read-only?) have
 * a different structure. So can't build a hostname. As of now they have 9 regions, based on AWS ones. And
 * so MAY need to update the strings/slugs once those new hostnames are set, as we do a string match and so
 * need to be sure these are the correct strings to look for
 *
 * See:
 * https://fly.io/docs/reference/regions
 * https://docs.planetscale.com/concepts/regions
 *
 * @param {String} appRegion the Fly region e.g "lhr"
 * @param {Boolean} isPrimaryRegion essentially (FLY_REGION === PRIMARY_REGION)?
 * @param {Array} connectionStrings
 * @returns {String}
 */
function nearestDatabaseUrl(appRegion = '', isPrimaryRegion = false, connectionStrings = []) {
    if (!appRegion || appRegion === "unknown") {
        // we don't know where the app is running. Probably running locally. Default to
        // the first available connection string (the primary)
        console.debug("nearestDatabaseUrl() not sure where the app is running (local?) so default to connect to the first database (which should be the primary)");
        return connectionStrings[0];
    }

    if (isPrimaryRegion) {
        // we've already determined that the app is running in the same region as the primary. For example
        // if the primary database is in us-east and the app is running in iad. No need to do any thinking. Pick it.
        // This will trigger for replayed writes
        console.debug("nearestDatabaseUrl() the app is running the primary region so connect to the first database (which should be the primary)");
        return connectionStrings[0];
    }

    // ... else need to find the closest Planetscale region that has a database in it. So ... need to return an
    // array, not simply a string. As that lets us prefer e.g 'eu-west' over 'eu-central' over ... regionN
    console.debug("nearestDatabaseUrl() make an array of regions (from likely best to worst latency) based on where this vm is running:", appRegion);
    let dbRegions = [];
    switch (appRegion) {
        case 'ams': // Amsterdam (Netherlands)
            dbRegions = ['eu-central', 'eu-west', 'us-east', 'us-west', 'ap-south', 'aws-sa-east-1', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2'];
            break;

        case 'cdg': // Paris (France)
            dbRegions = ['eu-central', 'eu-west', 'us-east', 'us-west', 'ap-south', 'aws-sa-east-1', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2'];
            break;

        case 'dfw': // Dallas, Texas (US)
            dbRegions = ['us-east', 'us-west', 'aws-sa-east-1', 'eu-west', 'eu-central', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2', 'ap-south'];
            break;

        case 'ewr': // Secaucus, NJ (US)
            dbRegions = ['us-east', 'us-west', 'aws-sa-east-1', 'eu-west', 'eu-central', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2', 'ap-south'];
            break;

        case 'fra': // Frankfurt (Germany)
            dbRegions = ['eu-central', 'eu-west', 'us-east', 'us-west', 'ap-south', 'aws-sa-east-1', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2'];
            break;

        case 'gru': // Sao Paulo (Brazil)
            dbRegions = ['aws-sa-east-1', 'us-east', 'us-west', 'eu-west', 'aws-ap-southeast-2', 'eu-central', 'ap-south', 'ap-southeast', 'ap-northeast'];
            break;

        case 'hkg': // Hong Kong
            dbRegions = ['ap-northeast', 'ap-southeast', 'aws-ap-southeast-2', 'us-west', 'us-east', 'ap-south', 'aws-sa-east-1', 'eu-central', 'eu-west'];
            break;

        case 'iad': // Ashburn, Virginia (US)
            dbRegions = ['us-east', 'us-west', 'aws-sa-east-1', 'eu-west', 'eu-central', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2', 'ap-south'];
            break;

        case 'lax': // LA, California (US)
            dbRegions = ['us-west', 'us-east', 'aws-sa-east-1', 'eu-west', 'eu-central', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2', 'ap-south'];
            break;

        case 'lhr': // London (UK)
            dbRegions = ['eu-west', 'eu-central', 'us-east', 'us-west', 'ap-south', 'aws-sa-east-1', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2'];
            break;

        case 'maa': // Chennai (India)
            dbRegions = ['ap-south', 'ap-southeast', 'aws-ap-southeast-2', 'ap-northeast', 'eu-central', 'eu-west', 'us-east', 'us-west', 'aws-sa-east-1'];
            break;

        case 'mad': // Madrid (Spain)
            dbRegions = ['eu-central', 'eu-west', 'us-east', 'us-west', 'ap-south', 'aws-sa-east-1', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2'];
            break;

        case 'mia': // Miami, Florida (US)
            dbRegions = ['us-east', 'us-west', 'aws-sa-east-1', 'eu-west', 'eu-central', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2', 'ap-south'];
            break;

        case 'nrt': // Tokyo (Japan)
            dbRegions = ['ap-northeast', 'ap-southeast', 'aws-ap-southeast-2', 'us-west', 'us-east', 'eu-central', 'eu-west', 'ap-south', 'aws-sa-east-1'];
            break;

        case 'ord': // Chicago, Illinois (US)
            dbRegions = ['us-east', 'us-west', 'aws-sa-east-1', 'eu-west', 'eu-central', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2', 'ap-south'];
            break;

        case 'scl': // Santiago (Chile)
            dbRegions = ['aws-sa-east-1', 'us-east', 'us-west', 'aws-ap-southeast-2', 'eu-central', 'eu-west', 'ap-south', 'ap-southeast', 'ap-northeast'];
            break;

        case 'sea': // Seattle, Washington (US)
            dbRegions = ['us-west', 'us-east', 'aws-sa-east-1', 'eu-west', 'eu-central', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2', 'ap-south'];
            break;

        case 'sin': // Singapore
            dbRegions = ['ap-southeast', 'aws-ap-southeast-2', 'ap-northeast', 'ap-south', 'aws-sa-east-1', 'eu-central', 'eu-west', 'us-west', 'us-east'];
            break;

        case 'sjc': // Sunnyvale, California (US)
            dbRegions = ['us-west', 'us-east', 'aws-sa-east-1', 'eu-west', 'eu-central', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2', 'ap-south'];
            break;

        case 'syd': // Sydney (Australia)
            dbRegions = ['aws-ap-southeast-2', 'ap-southeast', 'ap-northeast', 'ap-south', 'us-west', 'us-east', 'eu-central', 'eu-west', 'aws-sa-east-1'];
            break;

        case 'yyz': // Toronto (Canada)
            dbRegions = ['us-east', 'us-west', 'eu-west', 'eu-central', 'aws-sa-east-1', 'ap-southeast', 'ap-northeast', 'aws-ap-southeast-2', 'ap-south'];
            break;

        default:
        // unknown/new Fly region
            break;
    }
    console.debug("nearestDatabaseUrl() these are the database regions will consider, ordered by preference:", dbRegions.join(','));

    // if the Fly region is not known/listed/new again, default to the first connection string:
    if (dbRegions.length === 0) {
        return connectionStrings[0];
    }

    // else we have an array of regions, ordered by (likely) latency. So it is now a case of
    // seeing if there is a database in that region. If so, great, return that and stop.
    // IMPORTANT: there is a potential issue. Currently do a simple string match. But e.g
    // "ap-southeast" also has "ap-south" in. So would match a string comparison for both. Once
    // the new Planetscale hostnames are locked in could maybe solve that by appending a '.'?
    for (const dbRegion of dbRegions) {
        for (const connectionString of connectionStrings) {
            if (connectionString.includes(dbRegion)) {
            // found one: this should be the closest database region that also has a database in :)
                console.debug("nearestDatabaseUrl() the closest available database should be this one:", url.parse(connectionString).hostname);
                return connectionString;
            }
        }
    }

    // else could not find a database in any of those regions. Hmm. Presumably because Planetscale have changed
    // region hostnames/slugs and so the string lookup failed to find a match. So default to the first
    console.debug("nearestDatabaseUrl() could not find a preferred database so default to use the primary");
    return connectionStrings[0];
}

// connect to the database using the chosen connection string:
const db = mysql.createConnection(databaseUrl);
db.connect()

// for debugging, return which Planetscale hostname opted to connect to (can't reliably extract a region from this):
const usingDatabaseHost = url.parse(databaseUrl).hostname;

module.exports = {
    db,
    usingFlyRegion,
    usingPrimaryRegion,
    usingDatabaseHost
}