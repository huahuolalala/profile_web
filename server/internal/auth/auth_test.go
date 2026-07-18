package auth

import "testing"

func TestPasswordAndToken(t *testing.T) {
	hash, err := HashPassword("secret")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(hash, "secret") {
		t.Error("correct password rejected")
	}
	if CheckPassword(hash, "wrong") {
		t.Error("wrong password accepted")
	}
	tok, err := SignToken(42)
	if err != nil {
		t.Fatal(err)
	}
	uid, err := ParseToken(tok)
	if err != nil || uid != 42 {
		t.Errorf("ParseToken = %d, %v; want 42, nil", uid, err)
	}
	if _, err := ParseToken("garbage"); err == nil {
		t.Error("garbage token accepted")
	}
}
