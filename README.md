# iota-transaction-spammer-core
Spams the IOTA network with transactions doing proof-of-work locally. Must inject a curl implementation to perform proof-of-work.

The acceptable curl implementations at the moment are [ccurl](https://github.com/pRizz/curl-transaction-ccurl-impl)  and [WebGL2](https://github.com/pRizz/curl-transaction-webgl2-impl)

## Example Usage

    // for ccurl
    const curlImpl = require('curl-transaction-ccurl-impl')
    const spammer = require('iota-transaction-spammer-core')({ curlImpl })

    // for WebGL2
    const curlImpl = require('curl-transaction-webgl2-impl')
    const spammer = require('iota-transaction-spammer-core')({ curlImpl })

    spammer.options({
        message: 'My amazizng message to the tangle'
    })
    
    spammer.eventEmitter.on('state', (state) => {
        console.log(`${new Date().toISOString()}: new state: ${state}`)
    })
    
    spammer.eventEmitter.on('transactionCompleted', (success) => {
        success.forEach(element => {
            console.log(`${new Date().toISOString()}: new transaction created with hash: ${element.hash}`)
        })
    })
    
    spammer.startSpamming()