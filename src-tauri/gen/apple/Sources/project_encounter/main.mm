#import <CoreBluetooth/CoreBluetooth.h>
#import <UIKit/UIKit.h>

static NSString * const EncounterServiceUUIDString = @"4A985948-3BC6-450B-80D2-04A8F98F83CB";
static NSString * const EncounterCharacteristicUUIDString = @"4A985948-3BC6-450B-80D2-04A8F98F83CC";

@interface EncounterBleCheckController : UIViewController <CBCentralManagerDelegate, CBPeripheralManagerDelegate, CBPeripheralDelegate>
@end

@implementation EncounterBleCheckController {
  CBCentralManager *_central;
  CBPeripheralManager *_peripheralManager;
  CBUUID *_serviceUUID;
  CBUUID *_characteristicUUID;
  NSData *_userIDData;
  NSString *_userID;
  NSMutableDictionary<NSUUID *, CBPeripheral *> *_pendingPeripherals;
  NSMutableSet<NSString *> *_seenUserIDs;
  UILabel *_titleLabel;
  UILabel *_statusLabel;
  UITextView *_logView;
  BOOL _scanActive;
  BOOL _advertiseActive;
}

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.whiteColor;

  _serviceUUID = [CBUUID UUIDWithString:EncounterServiceUUIDString];
  _characteristicUUID = [CBUUID UUIDWithString:EncounterCharacteristicUUIDString];
  _pendingPeripherals = [NSMutableDictionary dictionary];
  _seenUserIDs = [NSMutableSet set];
  [self prepareUserID];
  [self buildUI];
  [self appendLog:[NSString stringWithFormat:@"自分のID: %@", _userID]];

  _central = [[CBCentralManager alloc] initWithDelegate:self queue:nil];
  _peripheralManager = [[CBPeripheralManager alloc] initWithDelegate:self queue:nil];
}

- (void)buildUI {
  UIView *root = self.view;

  _titleLabel = [[UILabel alloc] init];
  _titleLabel.translatesAutoresizingMaskIntoConstraints = NO;
  _titleLabel.text = @"iOS BLE CHECK";
  _titleLabel.textColor = UIColor.blackColor;
  _titleLabel.font = [UIFont systemFontOfSize:34 weight:UIFontWeightBlack];
  _titleLabel.numberOfLines = 0;

  _statusLabel = [[UILabel alloc] init];
  _statusLabel.translatesAutoresizingMaskIntoConstraints = NO;
  _statusLabel.text = @"起動中...";
  _statusLabel.textColor = UIColor.blackColor;
  _statusLabel.font = [UIFont monospacedSystemFontOfSize:15 weight:UIFontWeightBold];
  _statusLabel.numberOfLines = 0;

  _logView = [[UITextView alloc] init];
  _logView.translatesAutoresizingMaskIntoConstraints = NO;
  _logView.backgroundColor = UIColor.whiteColor;
  _logView.textColor = UIColor.blackColor;
  _logView.font = [UIFont monospacedSystemFontOfSize:13 weight:UIFontWeightRegular];
  _logView.editable = NO;
  _logView.layer.borderColor = UIColor.blackColor.CGColor;
  _logView.layer.borderWidth = 2;

  [root addSubview:_titleLabel];
  [root addSubview:_statusLabel];
  [root addSubview:_logView];

  UILayoutGuide *safe = root.safeAreaLayoutGuide;
  [NSLayoutConstraint activateConstraints:@[
    [_titleLabel.topAnchor constraintEqualToAnchor:safe.topAnchor constant:28],
    [_titleLabel.leadingAnchor constraintEqualToAnchor:safe.leadingAnchor constant:20],
    [_titleLabel.trailingAnchor constraintEqualToAnchor:safe.trailingAnchor constant:-20],
    [_statusLabel.topAnchor constraintEqualToAnchor:_titleLabel.bottomAnchor constant:18],
    [_statusLabel.leadingAnchor constraintEqualToAnchor:safe.leadingAnchor constant:20],
    [_statusLabel.trailingAnchor constraintEqualToAnchor:safe.trailingAnchor constant:-20],
    [_logView.topAnchor constraintEqualToAnchor:_statusLabel.bottomAnchor constant:18],
    [_logView.leadingAnchor constraintEqualToAnchor:safe.leadingAnchor constant:20],
    [_logView.trailingAnchor constraintEqualToAnchor:safe.trailingAnchor constant:-20],
    [_logView.bottomAnchor constraintEqualToAnchor:safe.bottomAnchor constant:-20],
  ]];
}

- (void)prepareUserID {
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  _userID = [defaults stringForKey:@"encounter_ble.native_check_user_id"];
  if (_userID.length == 0) {
    _userID = NSUUID.UUID.UUIDString.lowercaseString;
    [defaults setObject:_userID forKey:@"encounter_ble.native_check_user_id"];
  }
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:_userID];
  uuid_t bytes;
  [uuid getUUIDBytes:bytes];
  _userIDData = [NSData dataWithBytes:bytes length:16];
}

- (void)updateStatus {
  NSString *central = _central.state == CBManagerStatePoweredOn ? @"ON" : [NSString stringWithFormat:@"state=%ld", (long)_central.state];
  NSString *peripheral = _peripheralManager.state == CBManagerStatePoweredOn ? @"ON" : [NSString stringWithFormat:@"state=%ld", (long)_peripheralManager.state];
  _statusLabel.text = [NSString stringWithFormat:@"Central %@ / Peripheral %@\nSCAN %@ / ADV %@\nSEEN %lu",
                       central,
                       peripheral,
                       _scanActive ? @"OK" : @"NG",
                       _advertiseActive ? @"OK" : @"NG",
                       (unsigned long)_seenUserIDs.count];
}

- (void)appendLog:(NSString *)message {
  NSLog(@"[ProjectEncounterNativeBle] %@", message);
  NSString *line = [NSString stringWithFormat:@"%@  %@\n",
                   [NSDateFormatter localizedStringFromDate:NSDate.date dateStyle:NSDateFormatterNoStyle timeStyle:NSDateFormatterMediumStyle],
                   message];
  _logView.text = [_logView.text ?: @"" stringByAppendingString:line];
  if (_logView.text.length > 0) {
    [_logView scrollRangeToVisible:NSMakeRange(_logView.text.length - 1, 1)];
  }
}

- (void)startScanIfReady {
  if (_central.state != CBManagerStatePoweredOn) {
    [self updateStatus];
    return;
  }
  [_central stopScan];
  [_central scanForPeripheralsWithServices:@[_serviceUUID] options:@{ CBCentralManagerScanOptionAllowDuplicatesKey: @NO }];
  _scanActive = YES;
  [self appendLog:@"scan started"];
  [self updateStatus];
}

- (void)startAdvertisingIfReady {
  if (_peripheralManager.state != CBManagerStatePoweredOn) {
    [self updateStatus];
    return;
  }
  [_peripheralManager stopAdvertising];
  [_peripheralManager removeAllServices];

  CBMutableCharacteristic *characteristic = [[CBMutableCharacteristic alloc]
    initWithType:_characteristicUUID
    properties:CBCharacteristicPropertyRead
    value:_userIDData
    permissions:CBAttributePermissionsReadable];
  CBMutableService *service = [[CBMutableService alloc] initWithType:_serviceUUID primary:YES];
  service.characteristics = @[characteristic];
  [_peripheralManager addService:service];
  [_peripheralManager startAdvertising:@{ CBAdvertisementDataServiceUUIDsKey: @[_serviceUUID] }];
  [self appendLog:@"advertise requested"];
  [self updateStatus];
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
  [self appendLog:[NSString stringWithFormat:@"central state=%ld", (long)central.state]];
  [self startScanIfReady];
}

- (void)peripheralManagerDidUpdateState:(CBPeripheralManager *)peripheral {
  [self appendLog:[NSString stringWithFormat:@"peripheral state=%ld", (long)peripheral.state]];
  [self startAdvertisingIfReady];
}

- (void)peripheralManagerDidStartAdvertising:(CBPeripheralManager *)peripheral error:(NSError *)error {
  _advertiseActive = error == nil;
  [self appendLog:error ? [NSString stringWithFormat:@"advertise failed: %@", error.localizedDescription] : @"advertise started"];
  [self updateStatus];
}

- (void)peripheralManager:(CBPeripheralManager *)peripheral didReceiveReadRequest:(CBATTRequest *)request {
  if (![request.characteristic.UUID isEqual:_characteristicUUID]) {
    [peripheral respondToRequest:request withResult:CBATTErrorRequestNotSupported];
    return;
  }
  request.value = [_userIDData subdataWithRange:NSMakeRange(request.offset, _userIDData.length - request.offset)];
  [peripheral respondToRequest:request withResult:CBATTErrorSuccess];
  [self appendLog:@"GATT read served"];
}

- (void)centralManager:(CBCentralManager *)central didDiscoverPeripheral:(CBPeripheral *)peripheral advertisementData:(NSDictionary<NSString *, id> *)advertisementData RSSI:(NSNumber *)RSSI {
  NSDictionary<CBUUID *, NSData *> *serviceData = advertisementData[CBAdvertisementDataServiceDataKey];
  NSData *data = serviceData[_serviceUUID];
  if (data != nil && [self handlePayload:data source:@"service-data"]) {
    return;
  }
  if (_pendingPeripherals[peripheral.identifier] != nil) return;
  _pendingPeripherals[peripheral.identifier] = peripheral;
  peripheral.delegate = self;
  [self appendLog:[NSString stringWithFormat:@"connect GATT %@", peripheral.identifier.UUIDString]];
  [central connectPeripheral:peripheral options:nil];
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral {
  [self appendLog:@"GATT connected"];
  [peripheral discoverServices:@[_serviceUUID]];
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error {
  for (CBService *service in peripheral.services ?: @[]) {
    if ([service.UUID isEqual:_serviceUUID]) {
      [peripheral discoverCharacteristics:@[_characteristicUUID] forService:service];
    }
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverCharacteristicsForService:(CBService *)service error:(NSError *)error {
  for (CBCharacteristic *characteristic in service.characteristics ?: @[]) {
    if ([characteristic.UUID isEqual:_characteristicUUID]) {
      [peripheral readValueForCharacteristic:characteristic];
    }
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didUpdateValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error {
  if (characteristic.value != nil) {
    [self handlePayload:characteristic.value source:@"gatt"];
  } else if (error != nil) {
    [self appendLog:[NSString stringWithFormat:@"GATT read failed: %@", error.localizedDescription]];
  }
  [_central cancelPeripheralConnection:peripheral];
  [_pendingPeripherals removeObjectForKey:peripheral.identifier];
}

- (BOOL)handlePayload:(NSData *)data source:(NSString *)source {
  if (data.length != 16 || [data isEqualToData:_userIDData]) return data.length == 16;
  uuid_t bytes;
  [data getBytes:bytes length:16];
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDBytes:bytes];
  NSString *userID = uuid.UUIDString.lowercaseString;
  if ([_seenUserIDs containsObject:userID]) return YES;
  [_seenUserIDs addObject:userID];
  [self appendLog:[NSString stringWithFormat:@"SEEN %@ via %@", userID, source]];
  [self updateStatus];
  return YES;
}

@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation AppDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  self.window.rootViewController = [[EncounterBleCheckController alloc] init];
  [self.window makeKeyAndVisible];
  return YES;
}
@end

int main(int argc, char * argv[]) {
  @autoreleasepool {
    return UIApplicationMain(argc, argv, nil, NSStringFromClass(AppDelegate.class));
  }
}
