package api

import "encoding/json"

// Opt различает три состояния поля в PATCH-теле: ключ отсутствует (Set=false),
// ключ = null (Set=true, Val=nil), ключ со значением (Set=true, Val≠nil).
type Opt[T any] struct {
	Set bool
	Val *T
}

func (o *Opt[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Val = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	o.Val = &v
	return nil
}
