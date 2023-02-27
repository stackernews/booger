Feature: NIP-26 delegation
  Scenario: Alice delgates to Bob
    Given someone called Alice
    And someone called Bob
    When Bob sends a delegated_text_note as Alice with content "I'm Alice"
    And Alice subscribes to author Alice
    Then Alice receives a delegated_text_note event from Bob with content "I'm Alice"

