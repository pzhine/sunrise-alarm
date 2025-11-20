#!/usr/bin/env node

// Test script for the new two-tone notification system
// Run this to test the sound patterns

const { NotificationSoundService } = require('./dist-electron/main/notificationSounds.js');

async function testSounds() {
  console.log('Testing Bluetooth Notification Sounds');
  console.log('====================================');
  
  const soundService = new NotificationSoundService();
  await soundService.createDefaultSounds();
  
  console.log('\n1. Testing CONNECTION sound (Low→High):');
  await soundService.playSound('connect');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n2. Testing DISCONNECTION sound (High→Low):');
  await soundService.playSound('disconnect');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n3. Testing PAIRING sound (same as connection):');
  await soundService.playSound('pair');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n4. Testing ERROR sound (rapid beeps):');
  await soundService.playSound('error');
  
  console.log('\nSound test complete!');
}

testSounds().catch(console.error);