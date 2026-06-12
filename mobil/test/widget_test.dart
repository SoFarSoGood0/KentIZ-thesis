// Basic smoke test: verifies the app builds without throwing.

import 'package:flutter_test/flutter_test.dart';

import 'package:urban_chain_mobile/main.dart';

void main() {
  testWidgets('App builds without errors', (WidgetTester tester) async {
    await tester.pumpWidget(const UrbanChainMobileApp());
    await tester.pump();

    expect(find.byType(UrbanChainMobileApp), findsOneWidget);
  });
}
