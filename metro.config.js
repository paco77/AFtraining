const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
    /.*\/aft-web\/.*/,
    /.*\/aft-api\/.*/,
];



module.exports = config;
