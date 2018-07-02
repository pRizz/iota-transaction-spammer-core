/**
 * Created by Peter Ryszkiewicz (https://github.com/pRizz) on 7/1/2018.
 * https://github.com/pRizz/iota-transaction-spammer-core
 */

const iotaLib = require('iota.lib.js')
const curlTransaction = require('curl-transaction-core')
const EventEmitter = require('wolfy87-eventemitter')

let curl = null // injected
let iota // initialized in initializeIOTA
let isSpamming = false
let globalErrorCooldown = 5000 // milliseconds

// TODO: use this for listening to changes in options and emit change to eventEmitter
const optionsProxy = new Proxy({
    isLoadBalancing: true // change node after every PoW
}, {
    set: (obj, prop, value) => {
        obj[prop] = value
        eventEmitter.emitEvent('optionChanged', [prop, value])
        return true
    }
})

// from 'https://iotasupport.com/providers.json' + requested additions - unreliable nodes
// message me on Discord (Peter Ryszkiewicz) or make an issue here is you want your node added: https://github.com/pRizz/iota-transaction-spammer-core/issues
const httpProviders = [
    "http://iota-community.org:14265",
    "http://node.davidsiota.com:14265",
    "http://173.249.18.180:14265",
    "http://iotanode.party:14265",
    "http://node03.iotatoken.nl:14265",
    "http://node.lukaseder.de:14265",
    "http://node01.iotatoken.nl:14265",
    "http://node05.iotatoken.nl:16265",
    "http://cryptoiota.win:14265",
    "http://137.74.198.100:14265",
    "http://astra2261.startdedicated.net:14265",
    "http://88.198.230.98:14265",
    "http://176.9.3.149:14265",
    "http://5.9.149.169:14265",
    "http://5.9.118.112:14265",
    "http://node02.iotatoken.nl:14265",
    "http://node04.iotatoken.nl:14265",
    "http://iota.love:16000",
    "http://iota.glass:14265",
    "http://35.189.126.122:14265",
    "http://rmnode.de:14265",
    "http://35.198.122.103:14265",
    "http://173.249.19.121:14265",
    "http://india.is.pure.iota.sex:14265",
    "http://iota.bereliable.nl:14265",
    "http://45.77.232.81:14265",
    "http://iota01.nodes.no:14265",
    "http://45.76.246.130:14265",
    "http://173.249.16.113:14265",
    "http://node.hans0r.de:14265",
    "http://iota.kun.com:14265",
    "http://37.221.197.91:14265",
    "http://my.iotaserver.de:14265",
    "http://node.iota.com.tw:5000",
    "http://iota.teamveno.eu:14265",
    "http://35.197.197.126:14265",
    "http://82.220.37.227:14265",
    "http://emslaender.spdns.eu:14265",
    "http://37.205.12.49:14265",
    "http://iota.3n.no:14265",
    "http://iota2.3n.no:14265",
    "http://173.249.22.101:14265",
    "http://173.249.18.125:14265",
    "http://pubtest.iotaboost.com:14625",
    "http://213.136.88.82:14265",
    "http://5.189.128.164:14265",
    "http://heimelaga.vodka:14265",
    "http://iotausa.mooo.com:14265",
    "http://iota.band:14265",
    "http://iotanode.prizziota.com:80", // author's node :)
    'http://iota-node-nelson.prizziota.com:80', // author's node :)
]

const httpsProviders = [
    "https://node.iota-community.org:443",
    "https://iotanode.us:443",
    "https://iri3-api.iota.fm:443",
    "https://node.iota.dance:443",
    "https://nodes.iota.cafe:443",
    "https://iri2-api.iota.fm:443",
    "https://nelson1-api.iota.fm:443",
    "https://node.neffware.com:443",
    "https://wallet1.iota.town:443",
    "https://iotanode.prizziota.com:443", // author's node :)
    'https://iota-node-nelson.prizziota.com:443', // author's node :)
]

let onlySpamHTTPS = false // useful when running in the web browser over https when spamming http does not work
const validProviders = getValidProviders()
let _currentProvider = getRandomProvider()

// Overrides the _currentProvider
let customProvider = null

let depth = 10
let weight = 14
let spamSeed = generateSeed()

const hostingSite = 'https://github.com/pRizz/iota.transactionSpammer.js'
let message = `This spam was generated by the transaction spammer: ${hostingSite}`
let tag = "DECODEMESSAGEINASCII"
let numberOfTransfersInBundle = 1

const eventEmitter = new EventEmitter()

let transactionCount = 0
let approvalCount = 0
let averageApprovalDuration = 0 // milliseconds

const unsyncedNodeMilestoneThreshold = 5

function getNextErrorCooldown() {
    return globalErrorCooldown *= (1.2 + 0.5 * Math.random()) // backoff algorithm
}

function getCurrentProvider() {
    if (customProvider) { return customProvider }
    return _currentProvider
}

// must be https if the hosting site is served over https; SSL rules
function getValidProviders() {
    return onlySpamHTTPS ? httpsProviders : httpProviders.concat(httpsProviders)
}

// returns a depth in [4, 12] inclusive
function generateDepth() {
    depth = Math.floor(Math.random() * (12 - 4 + 1)) + 4
    return depth
}

// WARNING: Not cryptographically secure. Do not use any seeds generated by this generator to actually store any value.
function generateSeed() {
    const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ9'
    return Array.from(new Array(81), (x, i) => validChars[Math.floor(Math.random() * validChars.length)]).join('')
}

function generateTransfers() {
    return Array.from(new Array(numberOfTransfersInBundle), (x, i) => generateTransfer())
}

function getTritifiedAsciiMessage() {
    return iota.utils.toTrytes(message)
}

function generateTransfer() {
    return {
        address: spamSeed,
        value: 0,
        message: getTritifiedAsciiMessage(),
        tag: tag
    }
}

function initializeIOTA() {
    eventEmitter.emitEvent('state', [`Initializing IOTA connection to ${getCurrentProvider()}`])
    iota = new iotaLib({'provider': getCurrentProvider()})
    iota.api.attachToTangle = curl.localAttachToTangle
}

function sendMessages() {
    if(!isSpamming) {
        eventEmitter.emitEvent('state', ['Stopped transaction spamming'])
        return
    }

    const transfers = generateTransfers()
    const transferCount = transfers.length
    const localApprovalCount = transferCount * 2
    const transactionStartDate = Date.now()
    eventEmitter.emitEvent('state', [`Performing PoW (Proof of Work) on ${localApprovalCount} transactions`])
    iota.api.sendTransfer(spamSeed, generateDepth(), weight, transfers, function(error, success){
        if (error) {
            eventEmitter.emitEvent('state', [`Error occurred while sending transactions: ${error}`])
            setTimeout(function(){
                changeProviderAndSync()
            }, getNextErrorCooldown())
            return
        }
        const transactionEndDate = Date.now()
        const transactionDuration = transactionEndDate - transactionStartDate // milliseconds
        const oldTotalApprovalDuration = averageApprovalDuration * approvalCount

        transactionCount += transferCount
        approvalCount += localApprovalCount
        averageApprovalDuration = (oldTotalApprovalDuration + transactionDuration) / approvalCount

        eventEmitter.emitEvent('state', [`Completed PoW (Proof of Work) on ${localApprovalCount} transactions`])
        eventEmitter.emitEvent('transactionCountChanged', [transactionCount])
        eventEmitter.emitEvent('approvalCountChanged', [approvalCount])
        eventEmitter.emitEvent('averageApprovalDurationChanged', [averageApprovalDuration])

        eventEmitter.emitEvent('transactionCompleted', [success])

        if(optionsProxy.isLoadBalancing) {
            eventEmitter.emitEvent('state', ['Changing nodes to balance the load'])
            return changeProviderAndSync()
        }

        checkIfNodeIsSynced()
    })
}

function getRandomProvider() {
    return validProviders[Math.floor(Math.random() * validProviders.length)]
}

function changeProviderAndSync() {
    eventEmitter.emitEvent('state', ['Randomly changing IOTA nodes'])
    _currentProvider = getRandomProvider()
    eventEmitter.emitEvent('state', [`New IOTA node: ${getCurrentProvider()}`])
    restartSpamming()
}

function checkIfNodeIsSynced() {
    if(!isSpamming) {
        eventEmitter.emitEvent('state', ['Stopped transaction spamming'])
        return
    }

    eventEmitter.emitEvent('state', ['Checking if node is synced'])

    iota.api.getNodeInfo(function(error, success){
        if(error) {
            eventEmitter.emitEvent('state', ['Error occurred while checking if node is synced'])
            setTimeout(function(){
                changeProviderAndSync()
            }, getNextErrorCooldown())
            return
        }

        const isNodeUnsynced =
            success.latestMilestone == spamSeed ||
            success.latestSolidSubtangleMilestone == spamSeed ||
            success.latestSolidSubtangleMilestoneIndex < (success.latestMilestoneIndex - unsyncedNodeMilestoneThreshold)

        const isNodeSynced = !isNodeUnsynced

        if(isNodeSynced) {
            eventEmitter.emitEvent('state', ['Node is synced'])
            sendMessages()
        } else {
            eventEmitter.emitEvent('state', [`Node is not synced. Trying again in ${globalErrorCooldown / 1000} seconds.`])
            setTimeout(function(){
                changeProviderAndSync() // Sometimes the node stays unsynced for a long time, so change provider
            }, getNextErrorCooldown())
        }
    })
}

// Only call if there is an error or there is no current spamming running
function restartSpamming() {
    if(!isSpamming) {
        eventEmitter.emitEvent('state', ['Stopped transaction spamming'])
        return
    }
    eventEmitter.emitEvent('state', ['Restart transaction spamming'])
    initializeIOTA()
    checkIfNodeIsSynced()
}

// Helper for tritifying a URL.
// WARNING: Not a perfect tritifier for URL's - only handles a few special characters
function tritifyURL(urlString) {
    return urlString.replace(/:/gi, 'COLON').replace(/\./gi, 'DOT').replace(/\//gi, 'SLASH').replace(/-/gi, 'DASH').toUpperCase()
}

function startSpamming() {
    if(isSpamming) { return }
    isSpamming = true
    eventEmitter.emitEvent('state', ['Start transaction spamming'])
    restartSpamming()
}

module.exports = function({ curlImpl }) {
    if(!curlImpl) {
        throw 'Must supply a curlImpl. See README.'
    }
    curl = curlTransaction({ curlImpl })

    return {
        // Get options, or set options if params are specified
        options(params) {
            if(!params) {
                return {
                    provider: _currentProvider,
                    customProvider: customProvider,
                    depth: depth,
                    weight: weight,
                    spamSeed: spamSeed,
                    message: message,
                    tag: tag,
                    numberOfTransfersInBundle: numberOfTransfersInBundle,
                    isLoadBalancing: optionsProxy.isLoadBalancing
                }
            }
            if(params.hasOwnProperty("provider")) {
                _currentProvider = params.provider
                initializeIOTA()
            }
            if(params.hasOwnProperty("customProvider")) {
                customProvider = params.customProvider
                initializeIOTA()
            }
            if(params.hasOwnProperty("depth")) { depth = params.depth }
            if(params.hasOwnProperty("weight")) { weight = params.weight }
            if(params.hasOwnProperty("spamSeed")) { spamSeed = params.spamSeed }
            if(params.hasOwnProperty("message")) { message = params.message }
            if(params.hasOwnProperty("tag")) { tag = params.tag }
            if(params.hasOwnProperty("numberOfTransfersInBundle")) { numberOfTransfersInBundle = params.numberOfTransfersInBundle }
            if(params.hasOwnProperty("isLoadBalancing")) { optionsProxy.isLoadBalancing = params.isLoadBalancing }
            if(params.hasOwnProperty("onlySpamHTTPS")) { onlySpamHTTPS = params.onlySpamHTTPS }
        },
        startSpamming,
        stopSpamming() {
            isSpamming = false
        },
        tritifyURL: tritifyURL,
        eventEmitter: eventEmitter, // TODO: emit an event when the provider randomly changes due to an error
        getTransactionCount: () => transactionCount,
        getApprovalCount: () => approvalCount,
        getAverageApprovalDuration: () => averageApprovalDuration,
        httpProviders: httpProviders,
        httpsProviders: httpsProviders,
        validProviders: validProviders,
    }
}
