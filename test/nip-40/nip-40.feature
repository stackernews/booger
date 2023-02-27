Feature: NIP-40 Expiration Timestamp
  Scenario: Alice sends an expired event
    Given someone called Alice
    When Alice drafts an expired text_note event with content "expired"
    Then Alice sends their last draft event unsuccessfully

  Scenario: Alice sends an unexpired event
    Given someone called Alice
    When Alice drafts an unexpired text_note event with content "unexpired"
    Then Alice sends their last draft event successfully

  Scenario: Alice sends an expiring event
    Given someone called Alice
    When Alice drafts a text_note event with content "expiring" expiring in 2 seconds
    And Alice sends their last draft event successfully
    And Alice subscribes to author Alice 2 seconds later
    Then Alice receives 0 text_note events and EOSE