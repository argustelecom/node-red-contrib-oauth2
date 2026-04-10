const should = require('should'); // eslint-disable-line no-unused-vars
const helper = require('node-red-node-test-helper');
const nock = require('nock');
const oauth2Node = require('@argustelecom/node-red-contrib-oauth2/src/oauth2.js');

helper.init(require.resolve('node-red'));

/**
 * Wrap node.error to assert OAuth2 failures without a second output (all errors are catchable).
 */
function tapNodeError(node, handler) {
   const orig = node.error;
   node.error = function (logMsg, msg) {
      handler(logMsg, msg);
      return orig.call(node, logMsg, msg);
   };
}

describe('OAuth2 Node Error Handling', function () {
   before(function (done) {
      this.timeout(20000); // Increase timeout to 20000ms for more room
      console.log('Starting Node-RED server...');
      helper.startServer(done);
   });

   after(function (done) {
      this.timeout(20000); // Increase timeout to 20000ms for more room
      console.log('Stopping Node-RED server...');
      helper.stopServer(done);
   });

   afterEach(function (done) {
      console.log('Unloading flows...');
      helper.unload().then(function () {
         nock.cleanAll();
         done();
      });
   });

   it('should handle errors', function (done) {
      this.timeout(10000); // Set timeout for individual test
      console.log('Testing error handling...');
      const flow = [{ id: 'n1', type: 'oauth2', name: 'oauth2', wires: [[]] }];
      const credentials = {
         clientId: 'testClientId',
         clientSecret: 'testClientSecret'
      };

      helper.load(oauth2Node, flow, credentials, function () {
         const n1 = helper.getNode('n1');

         tapNodeError(n1, function (logMsg, msg) {
            try {
               logMsg.should.be.a.String();
               msg.should.have.property('oauth2Error');
               msg.oauth2Error.should.have.property('message', 'mocked error');
               done();
            } catch (err) {
               done(err);
            }
         });

         console.log('Setting up nock for invalid-url.com...');
         nock('https://invalid-url.com').post('/').replyWithError('mocked error');

         console.log('Sending input to node...');
         n1.receive({
            oauth2Request: {
               access_token_url: 'https://invalid-url.com',
               credentials: {
                  grant_type: 'client_credentials',
                  client_id: 'testClientId',
                  client_secret: 'testClientSecret',
                  scope: 'testScope'
               }
            }
         });
      });
   });

   it('should handle invalid client credentials', function (done) {
      this.timeout(10000); // Set timeout for individual test
      console.log('Testing invalid client credentials handling...');
      const flow = [{ id: 'n1', type: 'oauth2', name: 'oauth2', wires: [[]] }];
      const credentials = {
         clientId: 'invalidClientId',
         clientSecret: 'invalidClientSecret'
      };

      helper.load(oauth2Node, flow, credentials, function () {
         const n1 = helper.getNode('n1');

         console.log('Setting up nock for example.com...');
         const scope = nock('https://example.com').post('/oauth2/token').reply(401, { error: 'invalid_client' });

         tapNodeError(n1, function (logMsg, msg) {
            try {
               logMsg.should.be.a.String();
               msg.should.have.property('oauth2Error');
               msg.oauth2Error.should.have.property('status', 401);
               msg.oauth2Error.data.should.have.property('error', 'invalid_client');
               scope.done();
               done();
            } catch (err) {
               done(err);
            }
         });

         console.log('Sending input to node...');
         n1.receive({
            oauth2Request: {
               access_token_url: 'https://example.com/oauth2/token',
               credentials: {
                  grant_type: 'client_credentials',
                  client_id: 'invalidClientId',
                  client_secret: 'invalidClientSecret',
                  scope: 'testScope'
               }
            }
         });
      });
   });
});
